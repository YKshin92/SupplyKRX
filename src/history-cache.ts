// Browser-session cache only: protected data never enters persistent storage.
const pending = new Map<string, Promise<unknown>>();
export function sessionData<T>(key:string, load:()=>Promise<T>):Promise<T>{
 const existing=pending.get(key);if(existing)return existing as Promise<T>;
 const promise=load().catch(error=>{pending.delete(key);throw error;});
 pending.set(key,promise);
 // Bound retained historical generations while allowing tab revisits.
 if(pending.size>16)pending.delete(pending.keys().next().value!);
 return promise;
}
export async function parallelParts<T,R>(items:T[],read:(item:T)=>Promise<R>,concurrency=4):Promise<R[]>{
 const results=new Array<R>(items.length);let next=0;
 await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{
  while(next<items.length){const index=next++;results[index]=await read(items[index]);}
 }));return results;
}
