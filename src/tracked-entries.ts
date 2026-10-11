/** Preserve the first qualifying registration for each stock, even after sales. */
export function trackedEntries<T extends {code:string;signal_date:string}>(events:T[]):T[]{
 const first=new Map<string,T>();
 for(const event of events){const previous=first.get(event.code);if(!previous||event.signal_date<previous.signal_date)first.set(event.code,event);}
 return [...first.values()];
}
export function passesRecentNet(net:number|null,minimum:number){return minimum===0||net!=null&&net>=minimum*1e8;}
