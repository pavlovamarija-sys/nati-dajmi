// @ts-ignore Deno resolves npm specifiers.
import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
// @ts-ignore Deno requires explicit extensions.
import { EXCHANGE_REQUEST_IMAGE_URL_LIFETIME_SECONDS, EXCHANGE_REQUEST_READ_LIMIT, attachSignedRequestImage, parseBearerAccessToken, parseVisibleExchangeRequest, validateReadExchangeRequests } from '../_shared/toy-exchange-request.ts';
type DenoRuntime={env:{get(name:string):string|undefined};serve(handler:(request:Request)=>Response|Promise<Response>):void};declare const Deno:DenoRuntime;
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const SELECT='id, listing_id, requester_user_id, owner_user_id, status, created_at, responded_at, toy_exchange_listings!inner(name, image_path, asking_value_stars)';
Deno.serve(async(request)=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});if(request.method!=='POST')return json({error:{code:'METHOD_NOT_ALLOWED'}},405);
  let body:unknown;try{body=await request.json();}catch{return json({error:{code:'INVALID_REQUEST'}},400);}if(!validateReadExchangeRequests(body))return json({error:{code:'INVALID_REQUEST'}},400);
  const auth=await authenticate(request);if(!auth.ok)return json({error:{code:auth.status===401?'UNAUTHENTICATED':'UNAVAILABLE'}},auth.status);
  const admin=createAdmin();if(!admin)return json({error:{code:'UNAVAILABLE'}},500);
  const{data,error}=await admin.from('toy_exchange_requests').select(SELECT).or(`requester_user_id.eq.${auth.userId},owner_user_id.eq.${auth.userId}`).order('created_at',{ascending:false}).limit(EXCHANGE_REQUEST_READ_LIMIT);
  if(error||!Array.isArray(data)){console.error('get-my-exchange-requests query failed.',{errorCode:readCode(error)});return json({error:{code:'UNAVAILABLE'}},500);}
  const visible=data.map((row)=>parseVisibleExchangeRequest(row,auth.userId));if(visible.some((item)=>item===null))return json({error:{code:'UNAVAILABLE'}},500);
  const signed=await Promise.all(visible.map(async(item)=>{if(!item)return null;const{data:image,error:imageError}=await admin.storage.from('toy-shelf-images').createSignedUrl(item.imagePath,EXCHANGE_REQUEST_IMAGE_URL_LIFETIME_SECONDS);if(imageError)console.warn('get-my-exchange-requests signing failed.',{requestId:item.dto.requestId,errorCode:readCode(imageError)});const dto=attachSignedRequestImage(item.dto,imageError?null:image?.signedUrl??null);return dto?{direction:item.direction,dto}:null;}));
  if(signed.some((item)=>item===null))return json({error:{code:'UNAVAILABLE'}},500);
  return json({sent:signed.filter((item)=>item?.direction==='SENT').map((item)=>item?.dto),received:signed.filter((item)=>item?.direction==='RECEIVED').map((item)=>item?.dto)},200);
});
type Client=ReturnType<typeof createClient>;
async function authenticate(request:Request):Promise<{ok:true;userId:string}|{ok:false;status:401|500}>{const token=parseBearerAccessToken(request.headers.get('Authorization'));const url=Deno.env.get('SUPABASE_URL')?.trim();const key=Deno.env.get('SUPABASE_ANON_KEY')?.trim();if(!token)return{ok:false,status:401};if(!url||!key)return{ok:false,status:500};const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const{data,error}=await client.auth.getUser(token);return error||!data.user?.id?{ok:false,status:401}:{ok:true,userId:data.user.id};}
function createAdmin():Client|null{const url=Deno.env.get('SUPABASE_URL')?.trim();const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();return url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null;}
function readCode(error:unknown):string|undefined{return typeof error==='object'&&error!==null&&'code'in error&&typeof error.code==='string'?error.code:undefined;}
function json(body:unknown,status:number):Response{return new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});}
