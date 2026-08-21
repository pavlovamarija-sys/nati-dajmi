// @ts-ignore Deno resolves npm specifiers.
import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
// @ts-ignore Deno requires explicit extensions.
import { parseBearerAccessToken, serializeExchangeRequestMutation, validateRespondExchangeRequest } from '../_shared/toy-exchange-request.ts';
type DenoRuntime={env:{get(name:string):string|undefined};serve(handler:(request:Request)=>Response|Promise<Response>):void};declare const Deno:DenoRuntime;
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
Deno.serve(async(request)=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});if(request.method!=='POST')return json({error:{code:'METHOD_NOT_ALLOWED'}},405);
  let body:unknown;try{body=await request.json();}catch{return json({error:{code:'INVALID_REQUEST'}},400);}const input=validateRespondExchangeRequest(body);if(!input)return json({error:{code:'INVALID_REQUEST'}},400);
  const auth=await authenticate(request);if(!auth.ok)return json({error:{code:auth.status===401?'UNAUTHENTICATED':'RESPONSE_FAILED'}},auth.status);
  const admin=createAdmin();if(!admin)return json({error:{code:'RESPONSE_FAILED'}},500);
  const{data:existing,error:lookupError}=await admin.from('toy_exchange_requests').select('id, owner_user_id, status').eq('id',input.requestId).maybeSingle();
  if(lookupError)return safeFailure('lookup',lookupError);if(!existing||existing.owner_user_id!==auth.userId)return json({error:{code:'REQUEST_NOT_FOUND'}},404);if(existing.status!=='PENDING')return json({error:{code:'REQUEST_NOT_PENDING'}},409);
  const client=createUserClient(auth.token);if(!client)return json({error:{code:'RESPONSE_FAILED'}},500);
  const{data,error}=await client.rpc('respond_to_toy_exchange_request',{p_request_id:input.requestId,p_decision:input.decision});
  if(error)return safeFailure('rpc',error);const response=serializeExchangeRequestMutation(data);return response?json({request:response},200):json({error:{code:'RESPONSE_FAILED'}},500);
});
type Client=ReturnType<typeof createClient>;
async function authenticate(request:Request):Promise<{ok:true;userId:string;token:string}|{ok:false;status:401|500}>{const token=parseBearerAccessToken(request.headers.get('Authorization'));const url=Deno.env.get('SUPABASE_URL')?.trim();const key=Deno.env.get('SUPABASE_ANON_KEY')?.trim();if(!token)return{ok:false,status:401};if(!url||!key)return{ok:false,status:500};const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const{data,error}=await client.auth.getUser(token);return error||!data.user?.id?{ok:false,status:401}:{ok:true,userId:data.user.id,token};}
function createUserClient(token:string):Client|null{const url=Deno.env.get('SUPABASE_URL')?.trim();const key=Deno.env.get('SUPABASE_ANON_KEY')?.trim();return url&&key?createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}}):null;}
function createAdmin():Client|null{const url=Deno.env.get('SUPABASE_URL')?.trim();const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();return url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null;}
function safeFailure(stage:string,error:unknown):Response{console.error('respond-toy-exchange-request failed.',{stage,errorCode:readCode(error)});return json({error:{code:'RESPONSE_FAILED'}},500);}
function readCode(error:unknown):string|undefined{return typeof error==='object'&&error!==null&&'code'in error&&typeof error.code==='string'?error.code:undefined;}
function json(body:unknown,status:number):Response{return new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});}
