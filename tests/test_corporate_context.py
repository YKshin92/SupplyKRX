import json
from pathlib import Path
import unittest
from copy import deepcopy
from collector.corporate_context import action_map,published_reconciliation

class CorporateContextTests(unittest.TestCase):
    def test_published_context_is_evidence_gated_and_excludes_unsettled_rights(self):
        self.assertIsNone(published_reconciliation('2023-11-26'))
        self.assertEqual([a['code'] for a in published_reconciliation('2026-05-14')['actions']],['323990','025900','000070'])
        c=published_reconciliation('2026-10-23')
        self.assertEqual([a['code'] for a in c['actions']],['323990','025900','007340','000070'])
        dn=c['actions'][2]
        self.assertEqual(dn['resume_date'],'2024-10-08')
        self.assertEqual(dn['evidence_on'],'2026-05-15')
        self.assertNotIn('fraction_policy',dn)
        self.assertTrue(all(a['fraction_policy']=='zero' for a in c['actions'] if a['code']!='007340'))
        self.assertEqual(c['actions'][3]['new_code'],'0120G0')
        self.assertIn('단주 0원',c['policy'])
        with self.assertRaises(ValueError):published_reconciliation('0000-01-01')
    def test_shared_input_contract(self):
        fixture=json.loads((Path(__file__).parent/'fixtures/corporate-context.json').read_text(encoding='utf-8'))
        self.assertEqual(len(action_map(fixture['valid'])),1)
        for patch in fixture['invalid']:
            value=deepcopy(fixture['valid'])
            if 'action' in patch:value['actions'][0].update(patch['action'])
            else:value.update(patch)
            with self.subTest(patch=patch),self.assertRaises(ValueError):action_map(value)
        duplicate=deepcopy(fixture['valid'])
        duplicate['actions'].append(dict(duplicate['actions'][0],code='000002'))
        with self.assertRaises(ValueError):action_map(duplicate)
        alpha=deepcopy(fixture['valid']);alpha['actions'][0]['code']='00AB12'
        self.assertIn('00AB12',action_map(alpha))
