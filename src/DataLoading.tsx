export default function DataLoading({label='데이터를 불러오고 있습니다'}:{label?:string}){
 return <div className="data-loading" role="status" aria-live="polite" aria-busy="true"><div className="data-loading-label"><span aria-hidden="true"/>{label}</div><div className="loading-placeholder" aria-hidden="true"/><div className="loading-placeholder short" aria-hidden="true"/></div>;
}
