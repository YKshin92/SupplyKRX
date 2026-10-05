export function priceChange(price:number|null|undefined, previousClose:number|null|undefined):number|null {
 if(price==null||price<=0||previousClose==null||previousClose<=0)return null;
 return (price/previousClose-1)*100;
}
export function percentLabel(value:number|null):string {
 return value==null?'—':`${value>0?'+':''}${value.toFixed(2)}%`;
}
