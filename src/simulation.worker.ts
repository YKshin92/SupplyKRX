import {runSimulation,type SimInput,type Settings} from './simulation-engine';
let input:SimInput|null=null;
self.onmessage=(event:MessageEvent<{id:number;input?:SimInput;settings:Settings}>)=>{const {id,settings}=event.data;try{if(event.data.input)input=event.data.input;if(!input)throw Error('데이터를 불러오지 못했습니다.');self.postMessage({id,result:runSimulation(input,settings)});}catch(e){self.postMessage({id,error:e instanceof Error?e.message:'계산 오류'});}};
