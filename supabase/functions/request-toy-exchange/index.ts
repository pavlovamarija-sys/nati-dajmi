// @ts-ignore Deno resolves npm specifiers.
import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
// @ts-ignore Deno requires explicit extensions.
import { buildExchangeRequestInsert, classifyRequestableListing, isUniqueViolation, parseBearerAccessToken, serializeExchangeRequestMutation, validateCreateExchangeRequest } from '../_shared/toy-exchange-request.ts';
type DenoRuntime={env:{get(name:string):string|undefined};serve(handler:(request:Request)=>Response|Promise<Response>):void};declare const Deno:DenoRuntime;
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
Deno.serve(async(request)=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(request.method!=='POST')return json({error:{code:'METHOD_NOT_ALLOWED'}},405);
  let body:unknown;try{body=await request.json();}catch{return json({error:{code:'INVALID_REQUEST'}},400);}
  const input=validateCreateExchangeRequest(body);if(!input)return json({error:{code:'INVALID_REQUEST'}},400);
  const auth=await authenticate(request);if(!auth.ok)return json({error:{code:auth.status===401?'UNAUTHENTICATED':'REQUEST_FAILED'}},auth.status);
  const admin=createAdmin();if(!admin)return json({error:{code:'REQUEST_FAILED'}},500);
  const {data:listing,error:listingError}=await admin.from('toy_exchange_listings').select('id, owner_user_id, status').eq('id',input.listingId).maybeSingle();
  if(listingError)return safeFailure('listing lookup',listingError);
  const eligibility=classifyRequestableListing(listing,auth.userId);
  if(!eligibility.ok)return json({error:{code:eligibility.reason}},eligibility.reason==='LISTING_NOT_FOUND'?404:409);
  const{data:accepted,error:acceptedError}=await admin.from('toy_exchange_requests').select('id').eq('listing_id',eligibility.listingId).eq('status','ACCEPTED').maybeSingle();
  if(acceptedError)return safeFailure('accepted request lookup',acceptedError);if(accepted)return json({error:{code:'LISTING_NOT_AVAILABLE'}},409);
  const {data:created,error:createError}=await admin.from('toy_exchange_requests').insert(buildExchangeRequestInsert(eligibility.listingId,auth.userId,eligibility.ownerUserId)).select('id, listing_id, status, created_at, responded_at').single();
  if(createError){if(isUniqueViolation(createError))return json({error:{code:'PENDING_REQUEST_EXISTS'}},409);return safeFailure('insert',createError);}
  const response=serializeExchangeRequestMutation(created);return response?json({request:response},201):json({error:{code:'REQUEST_FAILED'}},500);
});
type Client=ReturnType<typeof createClient>;
async function authenticate(request:Request):Promise<{ok:true;userId:string;token:string}|{ok:false;status:401|500}>{const token=parseBearerAccessToken(request.headers.get('Authorization'));const url=Deno.env.get('SUPABASE_URL')?.trim();const key=Deno.env.get('SUPABASE_ANON_KEY')?.trim();if(!token)return{ok:false,status:401};if(!url||!key)return{ok:false,status:500};const client:Client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const{data,error}=await client.auth.getUser(token);return error||!data.user?.id?{ok:false,status:401}:{ok:true,userId:data.user.id,token};}
function createAdmin():Client|null{const url=Deno.env.get('SUPABASE_URL')?.trim();const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();return url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null;}
function safeFailure(stage:string,error:unknown):Response{console.error('request-toy-exchange failed.',{stage,errorCode:readCode(error)});return json({error:{code:'REQUEST_FAILED'}},500);}
function readCode(error:unknown):string|undefined{return typeof error==='object'&&error!==null&&'code'in error&&typeof error.code==='string'?error.code:undefined;}
function json(body:unknown,status:number):Response{return new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});}
