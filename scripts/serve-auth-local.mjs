import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import authHandler from '../api/auth.js';
import collectHandler from '../api/collect.js';
import proxy from '../proxy.js';

const root=resolve('dist');const port=4181;
process.env.AUTH_APP_ORIGIN??=`http://127.0.0.1:${port}`;
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
http.createServer(async(req,res)=>{
 const url=new URL(req.url,`http://127.0.0.1:${port}`);
 const reply=Object.assign(res,{status(code){res.statusCode=code;return reply;},json(value){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return reply;}});
 try{
  const decision=await proxy(new Request(url,{headers:req.headers}));
  if(decision.headers.get('x-middleware-next')!=='1'){res.writeHead(decision.status,Object.fromEntries(decision.headers));return res.end(await decision.text());}
  for(const [key,value] of decision.headers)if(!key.startsWith('x-middleware-'))res.setHeader(key,value);
  if(url.pathname.startsWith('/api/')){
   req.query=Object.fromEntries(url.searchParams);
   if(req.method==='POST'){let body='';for await(const chunk of req){body+=chunk;if(body.length>8192)return reply.status(413).json({error:'요청이 너무 큽니다.'});}try{req.body=JSON.parse(body||'{}');}catch{return reply.status(400).json({error:'잘못된 요청입니다.'});}}
   if(url.pathname==='/api/auth')return authHandler(req,reply);
   if(url.pathname==='/api/collect')return collectHandler(req,reply);
   return reply.status(404).json({error:'없는 요청입니다.'});
  }
  const file=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+sep))return reply.status(403).json({error:'잘못된 경로입니다.'});
  const content=await readFile(file);res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(content);
 }catch(error){res.statusCode=error.code==='ENOENT'?404:500;res.end('요청을 처리하지 못했습니다.');}
}).listen(port,'127.0.0.1',()=>console.log(`인증 검증용 로컬 주소: http://127.0.0.1:${port}`));
