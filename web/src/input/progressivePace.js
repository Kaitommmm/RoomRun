// Presence only: accepted running keeps accelerating over time. Neither the
// current cadence nor swing amplitude sets the target speed. Silence brakes.
export function createProgressivePace(cfg={}) {
  let out=0,last=null,holdUntil=-Infinity;
  return {
    holdFor(ms,t) { if(out>0)holdUntil=Math.max(holdUntil,t+ms); },
    speed(running,now) {
      const dt=last==null?0:Math.max(0,Math.min(.1,(now-last)/1000));last=now;
      if(now<=holdUntil)return out; // a jump preserves speed; it cannot charge it
      out=Math.max(0,Math.min(1,out+(running?dt/(cfg.toFullSeconds??6):-dt/(cfg.toStopSeconds??1.8))));
      return out;
    },
    reset() {out=0;last=null;holdUntil=-Infinity;},
  };
}
