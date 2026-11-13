// Fresh overlapping hand lifts, confirmed by another sample from EACH hand.
// Handheld sensors need not become weightless, or settle while the player runs.
export function createJumpGate(cfg) {
  const initial = () => ({ t:-Infinity, up:0, bounce:0, beforeLift:0, bar:cfg.jumpThreshold, edge:null });
  let hands = { L:initial(), R:initial() }, candidate = null, blockedUntil = -Infinity;
  return {
    reset() { hands={L:initial(),R:initial()};candidate=null;blockedUntil=-Infinity; },
    push(s, enabled = true) {
      if (!s || !['L','R'].includes(s.hand) || !Number.isFinite(s.t)) return false;
      let h=hands[s.hand];
      if (s.t<=h.t) return false;
      const fresh=cfg.jumpFreshMs??60;
      if (!Number.isFinite(s.up) || !Number.isFinite(s.gravity) || s.gravity<3 || s.gravity>16) {
        hands[s.hand]=initial();candidate=null;return false;
      }
      if (s.t-h.t>fresh) {
        // A resumed stream can arrive on the landing impulse of a lift whose
        // confirmation was lost. Briefly ignore that recovery impulse.
        if (Number.isFinite(h.t)) blockedUntil=Math.max(blockedUntil,s.t+(cfg.jumpRecoveryMs??200));
        h=hands[s.hand]=initial();candidate=null;
      }
      const other=hands[s.hand==='L'?'R':'L'];
      const otherFresh=Math.abs(s.t-other.t)<=fresh;
      const shared=otherFresh?Math.max(0,Math.min(s.up,other.up)):0;
      if (h.up<=0 && s.up>0) { h.beforeLift=h.bounce;h.bar=Math.max(cfg.jumpThreshold,(cfg.jumpOverBounce??1.5)*h.bounce); }
      const edge=h.up<h.bar && s.up>=h.bar;
      h.t=s.t;
      let fired=false;
      if (!enabled) {
        h.bounce=Math.max(Math.min(shared,cfg.bounceCap??20),h.bounce*(cfg.bounceDecay??.995));
        h.edge=null;candidate=null;h.up=s.up;return false;
      }
      if(s.t<blockedUntil) {
        h.bounce*=cfg.bounceDecay??.995;
      } else {
        h.bounce=Math.max(Math.min(shared,cfg.bounceCap??20),h.bounce*(cfg.bounceDecay??.995));
        if(edge)h.edge=s.t;
        const support=Math.max(4,cfg.jumpThreshold*.25);
        const bothUp=otherFresh && s.up>=support && other.up>=support;
        const paired=h.edge!=null && other.edge!=null && Math.abs(h.edge-other.edge)<=(cfg.jumpWindowMs??160)
          && s.t-h.edge<=(cfg.jumpWindowMs??160) && s.t-other.edge<=(cfg.jumpWindowMs??160);
        if(edge && bothUp && paired && !candidate) candidate={at:s.t,L:hands.L.t,R:hands.R.t};
        if(candidate && (!bothUp || s.t-candidate.at>(cfg.jumpWindowMs??160)))candidate=null;
        if(candidate && bothUp && s.t-candidate.at>=(cfg.jumpConfirmMs??20)
          && hands.L.t>candidate.L && hands.R.t>candidate.R) {
          fired=true;candidate=null;blockedUntil=s.t+cfg.jumpCooldownMs;
          for(const hand of Object.values(hands)) { hand.bounce=Math.min(hand.bounce,hand.beforeLift);hand.edge=null; }
        }
      }
      h.up=s.up;
      return fired;
    },
  };
}
