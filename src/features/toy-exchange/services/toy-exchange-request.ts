import { supabase } from '@/lib/supabase/client';
import type { MyToyExchangeRequests, ToyExchangeRequestMutation } from '@/features/toy-exchange/types/toy-exchange-request';
import { parseExchangeRequestMutationResponse, parseMyExchangeRequestsResponse } from '../../../../shared/toy-exchange-request-response';

export type ExchangeRequestDecision='ACCEPT'|'REJECT';
export async function requestToyExchange(listingId:string):Promise<ToyExchangeRequestMutation>{const id=required(listingId);const result=await invoke('request-toy-exchange',{listingId:id});return parseExchangeRequestMutationResponse(result);}
export async function respondToToyExchangeRequest(requestId:string,decision:ExchangeRequestDecision):Promise<ToyExchangeRequestMutation>{const id=required(requestId);if(decision!=='ACCEPT'&&decision!=='REJECT')throw neutral();const result=await invoke('respond-toy-exchange-request',{requestId:id,decision});return parseExchangeRequestMutationResponse(result);}
export async function getMyToyExchangeRequests():Promise<MyToyExchangeRequests>{return parseMyExchangeRequestsResponse(await invoke('get-my-exchange-requests',{}));}
async function invoke(name:string,body:Record<string,unknown>):Promise<unknown>{try{const{data,error}=await supabase.functions.invoke(name,{body});if(error)throw neutral();return data;}catch{throw neutral();}}
function required(value:string):string{const normalized=typeof value==='string'?value.trim():'';if(!normalized)throw neutral();return normalized;}
function neutral(){return new Error('Could not complete the exchange request.');}
