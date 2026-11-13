// Deliberate two-hand lift command, rather than a physical-jump classifier.
// Fresh sustained upward support and impulse must come from BOTH hands.
// Short body impacts, alternating arms, held levels and lost packets cannot
// be substituted for a new paired lift. No weightlessness or stillness needed.
export function createLiftGesture(cfg) {
  const initial=()=>({t:-Infinity,up:0,bar:cfg.liftThreshold??5,edge:null,armed:true,beforeLift:0});
  let hands={L:initial(),R:initial()},candidate=null,blockedUntil=-Infinity,bounce=0,bounceAt=null;
  const resetCandidate=()=>{candidate=null;for(const h of Object.values(hands))h.edge=null;};
  return {
    reset() { hands={L:initial(),R:initial()};candidate=null;blockedUntil=-Infinity;bounce=0;bounceAt=null; },
    push(s,enabled=true) {
      if(!s||!['L','R'].includes(s.hand)||!Number.isFinite(s.t))return false;
      const h=hands[s.hand],other=hands[s.hand==='L'?'R':'L'];
      if(s.t<=h.t)return false;
      const fresh=cfg.jumpFreshMs??60;
      if(!Number.isFinite(s.up)||!Number.isFinite(s.gravity)||s.gravity<3||s.gravity>16) {
        hands[s.hand]=initial();resetCandidate();blockedUntil=s.t+(cfg.jumpRecoveryMs??200);return false;
      }
      if(Number.isFinite(h.t)&&s.t-h.t>fresh) {
        resetCandidate();blockedUntil=Math.max(blockedUntil,s.t+(cfg.jumpRecoveryMs??200));h.up=0;h.armed=true;
      }
      if(s.up<=2) { h.armed=true;h.edge=null; }
      if(h.up<=2&&s.up>2) { h.beforeLift=bounce;h.bar=Math.max(cfg.liftThreshold??5,bounce*(cfg.liftOverBounce??1.6)); }
      if(h.armed&&h.up<h.bar&&s.up>=h.bar)h.edge=s.t;
      h.t=s.t;h.up=s.up;
      const otherFresh=Math.abs(s.t-other.t)<=fresh;
      const shared=otherFresh?Math.max(0,Math.min(h.up,other.up)):0;
      // Freeze the envelope during a prospective deliberate lift so it cannot
      // keep raising its own threshold. Disabled startup learns normal gait.
      const elapsed=bounceAt==null?0:Math.max(0,(s.t-bounceAt)/1000);bounceAt=s.t;
      if(!enabled||(s.t>=blockedUntil&&!candidate))bounce=Math.max(Math.min(shared,cfg.bounceCap??20),bounce*Math.exp(-elapsed/2));
      if(!enabled||s.t<blockedUntil) { resetCandidate();return false; }
      const support=cfg.liftSupport??3;
      const both=otherFresh&&h.up>=support&&other.up>=support;
      const paired=hands.L.armed&&hands.R.armed&&h.edge!=null&&other.edge!=null
        &&Math.abs(h.edge-other.edge)<=(cfg.jumpWindowMs??160)
        &&s.t-h.edge<=(cfg.jumpWindowMs??160)&&s.t-other.edge<=(cfg.jumpWindowMs??160);
      if(!candidate&&both&&paired)candidate={at:s.t,last:{L:hands.L.t,R:hands.R.t},impulse:{L:0,R:0},preBounce:Math.min(h.beforeLift,other.beforeLift)};
      if(candidate&&(!both||s.t-candidate.at>(cfg.liftWindowMs??320))) { resetCandidate();return false; }
      if(!candidate)return false;
      const since=s.t-candidate.last[s.hand];
      if(since>0&&since<=fresh)candidate.impulse[s.hand]+=Math.max(0,s.up)*since/1000;
      candidate.last[s.hand]=s.t;
      if(s.t-candidate.at<(cfg.liftMinMs??90)||Math.min(candidate.impulse.L,candidate.impulse.R)<(cfg.liftImpulse??.65))return false;
      bounce=Math.min(bounce,candidate.preBounce);resetCandidate();blockedUntil=s.t+cfg.jumpCooldownMs;
      hands.L.armed=hands.R.armed=false;
      return true;
    },
  };
}
