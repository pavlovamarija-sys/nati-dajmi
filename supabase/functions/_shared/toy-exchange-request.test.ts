// @ts-ignore Deno requires explicit extensions.
import { EXCHANGE_REQUEST_READ_LIMIT, attachSignedRequestImage, buildExchangeRequestInsert, classifyRequestableListing, parseBearerAccessToken, parseVisibleExchangeRequest, serializeExchangeRequestMutation, validateCreateExchangeRequest, validateRespondExchangeRequest } from './toy-exchange-request.ts';
declare const Deno: { test(name: string, fn: () => void): void };

Deno.test('request creation accepts only listingId and requires authentication token', () => {
  assertEqual(validateCreateExchangeRequest({ listingId: 'listing-1' })?.listingId, 'listing-1');
  assertEqual(validateCreateExchangeRequest({ listingId: 'listing-1', ownerUserId: 'owner' }), null);
  assertEqual(parseBearerAccessToken(null), null); assertEqual(parseBearerAccessToken('Bearer token'), 'token');
});
Deno.test('request eligibility requires AVAILABLE foreign listing', () => {
  assertEqual(classifyRequestableListing({ id:'listing-1',owner_user_id:'owner',status:'AVAILABLE' }, 'requester').ok, true);
  assertReason({ id:'listing-1',owner_user_id:'owner',status:'WITHDRAWN' }, 'LISTING_NOT_AVAILABLE');
  assertReason({ id:'listing-1',owner_user_id:'owner',status:'DRAFT' }, 'LISTING_NOT_AVAILABLE');
  assertReason({ id:'listing-1',owner_user_id:'requester',status:'AVAILABLE' }, 'OWN_LISTING');
});
Deno.test('insert contains authoritative server fields only and starts pending', () => {
  assertEqual(JSON.stringify(buildExchangeRequestInsert('listing-1','requester','owner')), JSON.stringify({listing_id:'listing-1',requester_user_id:'requester',owner_user_id:'owner',status:'PENDING'}));
});
Deno.test('response decision accepts only ACCEPT or REJECT', () => {
  assertEqual(validateRespondExchangeRequest({requestId:'request-1',decision:'ACCEPT'})?.decision,'ACCEPT');
  assertEqual(validateRespondExchangeRequest({requestId:'request-1',decision:'REJECT'})?.decision,'REJECT');
  assertEqual(validateRespondExchangeRequest({requestId:'request-1',decision:'ACCEPTED'}),null);
});
Deno.test('mutation response is safe and lifecycle-valid', () => {
  const dto=serializeExchangeRequestMutation({id:'request-1',listing_id:'listing-1',status:'PENDING',created_at:'2026-08-21T10:00:00Z',responded_at:null});
  assertEqual(dto?.status,'PENDING'); assertEqual('owner_user_id' in (dto??{}),false);
});
Deno.test('read DTO is visible only to participants and hides private fields', () => {
  const visible=parseVisibleExchangeRequest(validReadRow(),'requester');
  assertEqual(visible?.direction,'SENT');
  assertEqual(parseVisibleExchangeRequest(validReadRow(),'unrelated'),null);
  if(!visible)throw new Error('Expected visible request.');
  const dto=attachSignedRequestImage(visible.dto,'https://example.supabase.co/signed.jpg');
  for(const key of ['requester_user_id','owner_user_id','image_path','email','phone','address'])assertEqual(key in (dto??{}),false);
});
Deno.test('request read page is bounded',()=>assertEqual(EXCHANGE_REQUEST_READ_LIMIT,50));
function validReadRow(){return{id:'request-1',listing_id:'listing-1',requester_user_id:'requester',owner_user_id:'owner',status:'PENDING',created_at:'2026-08-21T10:00:00Z',responded_at:null,toy_exchange_listings:{name:'Камион',image_path:'owner/analysis/toy.jpg',asking_value_stars:500}};}
function assertReason(row:unknown,reason:string){const result=classifyRequestableListing(row,'requester');assertEqual(result.ok?'OK':result.reason,reason);}
function assertEqual(actual:unknown,expected:unknown){if(!Object.is(actual,expected))throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);}
