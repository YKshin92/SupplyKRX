"""Verify a private data commit reaches production; never log tokens or response bodies."""
import argparse
import json
import os
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, build_opener, HTTPRedirectHandler


class VerificationError(RuntimeError):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Vercel:
    def __init__(self):
        self.token = os.environ.get('VERCEL_TOKEN', '')
        self.bypass = os.environ.get('VERCEL_PROTECTION_BYPASS', '')
        self.github = os.environ.get('GITHUB_TOKEN', '')
        self.team = os.environ.get('VERCEL_TEAM_ID', 'team_pdqWo0XZkJpZLMn17nhFjMwD')
        if not self.token or not self.bypass or not self.github:
            raise VerificationError('Configure Vercel Secrets and supply the workflow GitHub token for branch verification.')
        self.opener = build_opener(NoRedirect())

    def request(self, path, body=None):
        url = 'https://api.vercel.com' + path + ('&' if '?' in path else '?') + urlencode({'teamId': self.team})
        return self.read(url, {'Authorization': 'Bearer ' + self.token}, body)

    def read(self, url, headers, body=None):
        headers = {**headers, 'Content-Type': 'application/json', 'User-Agent': 'SupplyKRX-deployment-check'}
        data = None if body is None else json.dumps(body).encode()
        try:
            with self.opener.open(Request(url, data=data, headers=headers), timeout=30) as response:
                return json.load(response)
        except HTTPError as error:
            raise VerificationError(f'HTTP {error.code}; check configured service permissions. Response bodies are not logged.') from None
        except (OSError, ValueError):
            raise VerificationError('Service request failed or returned invalid JSON.') from None

    def project(self):
        return self.request('/v9/projects/supply-krx')['id']

    def deployments(self, project):
        return self.request('/v6/deployments?' + urlencode({'projectId': project, 'target': 'production', 'limit': 100}))['deployments']

    def retry(self, deployment):
        return self.request('/v13/deployments', {'name': 'supply-krx', 'deploymentId': deployment['uid'], 'target': 'production', 'withLatestCommit': False})

    def latest_commit(self):
        return self.read('https://api.github.com/repos/YKshin92/SupplyKRX-data/commits/main', {'Authorization': 'Bearer ' + self.github, 'Accept': 'application/vnd.github+json'})['sha']

    def production_sha(self):
        alias = self.request('/v4/aliases/supply-krx.vercel.app')
        deployment_id = alias.get('deploymentId') or alias.get('deployment', {}).get('id')
        if not deployment_id:
            raise VerificationError('Production alias has no deployment.')
        return commit_sha(self.request('/v13/deployments/' + deployment_id))

    def manifest(self):
        return self.read('https://supply-krx.vercel.app/data/live/manifest.json', {'x-vercel-protection-bypass': self.bypass, 'Cache-Control': 'no-cache'})


def commit_sha(deployment):
    return (deployment.get('meta') or {}).get('githubCommitSha') or (deployment.get('gitSource') or {}).get('sha')


def verify(client, sha, date, max_retries=2, timeout=900, sleep=time.sleep, clock=time.monotonic):
    project = client.project()
    deadline = clock() + timeout
    retried = set()
    retries = 0
    while clock() < deadline:
        matches = [d for d in client.deployments(project) if commit_sha(d) == sha]
        matches.sort(key=lambda d: d.get('created', d.get('createdAt', 0)), reverse=True)
        if matches:
            latest = matches[0]
            state = latest.get('readyState') or latest.get('state')
            if state == 'READY':
                if client.production_sha() == sha:
                    manifest = client.manifest()
                    if manifest.get('as_of') != date or manifest.get('mode') != 'live':
                        raise VerificationError('Production manifest date/mode does not match collected data.')
                    print(f'Production verified: data date {date}, commit {sha[:7]}.')
                    return
            elif state in ('ERROR', 'CANCELED'):
                uid = latest.get('uid') or latest.get('id')
                if uid not in retried:
                    if retries >= max_retries:
                        raise VerificationError('Production deployment retry limit exceeded.')
                    # Never redeploy another commit or change project protection settings.
                    if not uid:
                        raise VerificationError('Deployment ID is missing.')
                    if client.latest_commit() != sha:
                        raise VerificationError('The data branch advanced; do not redeploy an older commit.')
                    client.retry({**latest, 'uid': uid})
                    retried.add(uid)
                    retries += 1
                    print(f'Retrying the same data commit, attempt {retries}/{max_retries}.')
        sleep(30)
    raise VerificationError('Timed out waiting for the expected commit and data date on production.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--commit', required=True)
    parser.add_argument('--date', required=True)
    args = parser.parse_args()
    try:
        verify(Vercel(), args.commit, args.date)
    except VerificationError as error:
        print(f'::error::{error}')
        raise SystemExit(1)
