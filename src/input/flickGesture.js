// Quick paired upward impulse, followed by fresh downward braking in EACH
// hand. This is a wrist/arm command, not a physical-jump/freefall classifier.
// A learned shared running envelope rejects familiar common body impacts.
export function createFlickGesture(cfg) {
  const initial=()=>({t:-Infinity,up:0,lowAt:-Infinity,bar:cfg.flickThreshold??8,armed:true,before:0,stroke:null});
  let hands={L:initial(),R:initial()},bounce=0,bounceAt=null,blockedUntil=-Infinity;
  function clear() {for(const h of Object.values(hands))h.stroke=null;}
  return {
    get busy() {
      const a=hands.L.stroke,b=hands.R.stroke;
      return !!(a&&b&&Math.abs(a.at-b.at)<=(cfg.flickPairMs??80));
    },
    reset() {hands={L:initial(),R:initial()};bounce=0;bounceAt=null;blockedUntil=-Infinity;},
    push(s,enabled=true) {
      if(!s||!['L','R'].includes(s.hand)||!Number.isFinite(s.t))return false;
      const h=hands[s.hand],other=hands[s.hand==='L'?'R':'L'];
      if(s.t<=h.t)return false;
      const fresh=cfg.jumpFreshMs??60,previous=h.up,dt=(s.t-h.t)/1000;
      if(!Number.isFinite(s.up)||!Number.isFinite(s.gravity)||s.gravity<3||s.gravity>16) {
        hands[s.hand]=initial();clear();blockedUntil=s.t+(cfg.jumpRecoveryMs??200);return false;
      }
      if(Number.isFinite(h.t)&&s.t-h.t>fresh) {
        clear();h.lowAt=-Infinity;blockedUntil=Math.max(blockedUntil,s.t+(cfg.jumpRecoveryMs??200));
      }
      if(previous<=2&&s.up>2) {h.before=bounce;h.bar=Math.max(cfg.flickThreshold??8,bounce*(cfg.flickOverBounce??1.6));}
      h.t=s.t;h.up=s.up;
      if(s.up<=2) {h.lowAt=s.t;h.armed=true;}
      const otherFresh=Math.abs(s.t-other.t)<=fresh;
      const anyStroke=Object.values(hands).some(x=>x.stroke);
      const elapsed=bounceAt==null?0:Math.max(0,(s.t-bounceAt)/1000);bounceAt=s.t;
      if(!enabled) {
        bounce=Math.max(otherFresh?Math.max(0,Math.min(h.up,other.up)):0,bounce*Math.exp(-elapsed/2));clear();return false;
      }
      if(s.t<blockedUntil) {clear();return false;}
      if(!h.stroke&&h.armed&&previous<h.bar&&s.up>=h.bar&&s.t-h.lowAt<=(cfg.flickRiseMs??100)
        &&dt>0&&dt<=fresh/1000&&(s.up-previous)/dt>=(cfg.flickJerk??90)) {
        // Include the sampled rising edge. Omitting it loses most of a short
        // flick's impulse when Bluetooth supplies only 30-50 samples/second.
        h.stroke={at:s.t,last:s.t,up:s.up,positive:(Math.max(0,previous)+s.up)*.5*dt,positiveSamples:1,brake:0,brakeSamples:0,phase:'up',before:h.before};
      }
      const stroke=h.stroke;
      if(stroke) {
        const delta=s.t-stroke.last;
        if(s.t-stroke.at>(cfg.flickWindowMs??260)||delta>fresh) {h.stroke=null;h.armed=false;}
        else if(delta>0) {
          if(stroke.phase==='up') {
            stroke.positive+=(Math.max(0,stroke.up)+Math.max(0,s.up))*.5*delta/1000;
            if(s.up>=3)stroke.positiveSamples++;
            if(s.up<=(cfg.flickBrakeThreshold??-3)) {
              const length=s.t-stroke.at;
              if(length<(cfg.flickMinUpMs??20)||length>(cfg.flickMaxUpMs??140)||stroke.positive<(cfg.flickImpulse??.35)) {
                h.stroke=null;h.armed=false;
              } else stroke.phase='brake';
            } else if(s.t-stroke.at>(cfg.flickMaxUpMs??140)) {h.stroke=null;h.armed=false;}
          }
          if(h.stroke&&stroke.phase==='brake') {
            if(s.up>2) {h.stroke=null;h.armed=false;}
            else {
              stroke.brake+=(Math.max(0,-stroke.up)+Math.max(0,-s.up))*.5*delta/1000;
              if(s.up<=(cfg.flickBrakeThreshold??-3))stroke.brakeSamples++;
            }
          }
          stroke.last=s.t;stroke.up=s.up;
        }
      }
      const a=hands.L.stroke,b=hands.R.stroke;
      if(a&&b&&Math.abs(a.at-b.at)>(cfg.flickPairMs??80)) {clear();return false;}
      const done=x=>x&&x.phase==='brake'&&x.brakeSamples>=2&&x.brake>=(cfg.flickBrakeImpulse??.06);
      if(otherFresh&&done(a)&&done(b)&&hands.L.up<=2&&hands.R.up<=2) {
        bounce=Math.min(bounce,a.before,b.before);clear();hands.L.armed=hands.R.armed=false;
        blockedUntil=s.t+cfg.jumpCooldownMs;return true;
      }
      if(!anyStroke&&!Object.values(hands).some(x=>x.stroke))
        bounce=Math.max(otherFresh?Math.max(0,Math.min(h.up,other.up)):0,bounce*Math.exp(-elapsed/2));
      return false;
    },
  };
}
