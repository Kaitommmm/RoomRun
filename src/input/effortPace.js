// A cycle's acceleration alone rewards tiny fast shakes. Divide by angular
// frequency squared to form an excursion proxy for periodic movement instead.
// This is a gameplay heuristic, not an IMU position/foot-contact measurement.
export function createEffortPace(cfg = {}) {
  let peaks=[], out=0, lastRead=null, holdUntil=-Infinity, held=0, effort=0;
  const clamp=x=>Math.max(0,Math.min(1,x));
  return {
    addPeak(peak,t,cycleRate=0) {
      if(Number.isFinite(peak)&&peak>0&&Number.isFinite(t)) {
        peaks.push({peak,t,cycleRate:Number.isFinite(cycleRate)?cycleRate:0}); if(peaks.length>3)peaks.shift();
      }
    },
    holdFor(ms,t) { holdUntil=Math.max(holdUntil,t+ms);held=out; },
    get effort() { return effort; },
    speed(cadenceSpeed,rate,now) {
      const dt=lastRead==null?0:Math.max(0,(now-lastRead)/1000);lastRead=now;
      peaks=peaks.filter(p=>now-p.t<=(cfg.maxAgeMs??1200));
      // Use each hand's full-cycle period BEFORE shared step deduplication.
      // A very fast short shake can lose counted steps through the refractory;
      // that slower counted cadence must not inflate its excursion estimate.
      const sorted=peaks.map(p=>p.peak/(2*Math.PI*Math.max(1,rate,p.cycleRate))**2).sort((a,b)=>a-b);
      const proxy=rate>0&&sorted.length?sorted[Math.floor(sorted.length/2)]:0;
      effort=clamp((proxy-(cfg.low??.012))/((cfg.full??.08)-(cfg.low??.012)));
      let target=peaks.length?cadenceSpeed*((cfg.floor??.25)+(1-(cfg.floor??.25))*effort):0;
      if(now<=holdUntil)target=Math.max(target,held);else held=0;
      const tau=target>out?(cfg.riseTau??.8):(cfg.fallTau??.25);
      out+=(target-out)*(1-Math.exp(-dt/tau));
      return out;
    },
    reset() { peaks=[];out=0;lastRead=null;holdUntil=-Infinity;held=0;effort=0; },
  };
}
