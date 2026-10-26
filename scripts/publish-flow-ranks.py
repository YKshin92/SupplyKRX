"""Generate rank data only into the selected authenticated/private web target."""
import argparse,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from collector.publish_flow_ranks import publish_ranks

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);parser.add_argument('--target',type=Path,required=True);args=parser.parse_args()
    result=publish_ranks(args.root,args.target)
    print('Flow ranks:',result['state'],result.get('as_of'),result.get('reason',''))
