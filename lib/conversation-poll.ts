// Retain responsive chat when connected, but stop hammering a failed service.
// The maximum retry delay stays below the call heartbeat expiry window.
export function conversationPollDelay(consecutiveFailures:number){
  return consecutiveFailures<=0?1100:Math.min(15000,1100*2**Math.min(4,consecutiveFailures));
}
