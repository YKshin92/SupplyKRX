import {trackedEntries} from './tracked-entries.ts';
export type Prior={max_buy:number;max_sell:number;avg_gross:number;absent_days:number};
export type TrackingEvent={id:string;code:string;name:string;market:string;signal_date:string;signal_net:number;signal_close:number|null;tracking_days:number;prior:Record<string,Prior|null>;current_return:number|null;current_close:number|null;latest_net:number|null;sum_since:number|null;buy_days:number;buy_days_complete:boolean;no_net_sale:boolean|null;no_gross_sale:boolean|null;net_sell_days:number;gross_sell_days:number;spark:(number|null)[];market_cap:number|null;sector:string|null;metadata_date:string|null};
export type TrackingData={schema_version:number;as_of:string;first_date:string;sessions:string[];minimum_net:number;events:TrackingEvent[]};
export type View='recent'|'new'|'sustained'|'watch'|'all';
export type Sale='all'|'net'|'gross';
export function registrations(events:TrackingEvent[],lookback:number,quietCap:number,strict:boolean,minimum:number){
 return trackedEntries(events.filter(e=>{const p=e.prior[String(lookback)];return p!=null&&e.signal_net>=minimum*1e8&&(strict?p.max_buy===0&&p.max_sell===0:p.max_buy<quietCap*1e8&&p.max_sell<quietCap*1e8);}));
}
export function visibleTracking(events:TrackingEvent[],view:View,sale:Sale,watch:string[]){
 return events.filter(e=>(view==='all'||view==='watch'||e.tracking_days<(view==='new'?5:10))&&(view!=='watch'||watch.includes(e.code))&&(view!=='sustained'||e.buy_days>=2&&e.buy_days_complete&&e.no_net_sale===true)&&(sale==='all'||(sale==='net'?e.no_net_sale:e.no_gross_sale)===true));
}
