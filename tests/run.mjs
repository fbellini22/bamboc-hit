import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const root = new URL("../", import.meta.url);
const coreModule = { exports: {} };
vm.runInNewContext(await readFile(new URL("core.js", root), "utf8"), { module: coreModule, URL, setTimeout, clearTimeout });
const core = coreModule.exports;
const sources = Object.fromEntries(await Promise.all(
  ["config.js", "spotify-auth.js", "player.js", "scanner.js", "app.js", "song.js"]
    .map(async name => [name, await readFile(new URL(name, root), "utf8")])
));
const tests = [];
const test = (name, run) => tests.push({ name, run });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const defer = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; };
const id = "4g7ASoGYRujjvNL6DHX9j8", otherId = "3yGyWqmw9eCQPdJJ6iJLWs";
const song = { id, title: "Editorial title", artist: "Editorial artist", year: "1963" };
const plain = value => JSON.parse(JSON.stringify(value));
function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key) };
}
function environment(extra = {}) {
  const context = {
    console: {log() {}, warn() {}, error() {}, debug() {}, table() {}},
    setTimeout, clearTimeout, setInterval, clearInterval, URL, URLSearchParams, AbortController,
    TextEncoder, crypto: webcrypto, btoa: value => Buffer.from(value, "binary").toString("base64"),
    localStorage: storage(), sessionStorage: storage(), Date, Math, performance,
    location: { origin: "https://test.example", pathname: "/game/", search: "", href: "https://test.example/game/", hostname: "test.example",
      assign(value) { this.assigned = value; } },
    document: { title: "Test" }, history: { replaceState() {} }, ...extra,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(sources["config.js"], context);
  context.Bamboc.config = { ...context.Bamboc.config, readyTimeoutMs: 80, playbackTimeoutMs: 80,
    requestTimeoutMs: 80, pollMs: 5 };
  context.Bamboc.core = core;
  return context;
}
function load(context, file) { vm.runInContext(sources[file], context, {filename:file}); }
const response = (status, data = {}, retry = null) => ({
  status, ok: status >= 200 && status < 300, json: async () => data, headers: { get: () => retry },
});

test("extractTrackId: URI, URL, query, hash, locale and whitespace", () => {
  for (const value of ["spotify:track:" + id, " SPOTIFY:TRACK:" + id + " ",
    "https://open.spotify.com/track/" + id, "https://open.spotify.com/track/" + id + "?si=123#test",
    "https://open.spotify.com/intl-it/track/" + id + "/"])
    assert.equal(core.extractTrackId(value), id);
});
test("extractTrackId rejects spoofed hosts, wrong types, short IDs, album, HTTP, raw IDs and garbage", () => {
  for (const value of [null, 123, {}, "", id, "spotify:album:" + id, "spotify:track:abc",
    "https://open.spotify.com.evil/track/" + id, "http://open.spotify.com/track/" + id,
    "https://evil@open.spotify.com/track/" + id, "https://open.spotify.com:444/track/" + id,
    "https://open.spotify.com/album/" + id, "https://open.spotify.com/track/" + id + "/extra"])
    assert.equal(core.extractTrackId(value), null);
});
test("catalog uses exact local metadata and handles absent IDs", () => {
  const catalog = core.createCatalog([song]);
  assert.deepEqual(plain(catalog.lookup(id)), song);
  assert.equal(catalog.lookup(otherId), null);
  assert.ok(Object.isFrozen(catalog.lookup(id)));
});
test("identical duplicate is reported and indexed once", () => {
  const catalog = core.createCatalog([song, {...song}]);
  assert.equal(catalog.size, 1);
  assert.ok(catalog.issues.some(x => x.code === "duplicate-id"));
  assert.ok(catalog.issues.some(x => x.code === "duplicate-entry"));
});
test("conflicting duplicate quarantines ID regardless of third repetition", () => {
  const catalog = core.createCatalog([song, {...song, title:"Different"}, song]);
  assert.equal(catalog.lookup(id), null);
  assert.equal(catalog.isConflict(id), true);
});
test("dataset validation rejects malformed IDs, missing fields, invalid years/duration", () => {
  const issues = core.validateSongs([{id:"bad", title:"", artist:42, year:"3000", durationMs:-1}, null]);
  for (const code of ["invalid-id", "missing", "invalid-text", "invalid-year", "invalid-duration", "entry"])
    assert.ok(issues.some(x => x.code === code), code);
  assert.equal(core.createCatalog([{...song, year:"no"}]).size, 0);
  assert.equal(core.validateSongs(null)[0].code, "dataset");
  assert.ok(core.validateSongs([{...song, title: 42, artist: "Long artist name"}])
    .some(issue => issue.code === "invalid-text"));
});
test("dataset warnings detect spaces, separators, empty credits and encoding without mutation", () => {
  const entry = {...song, title:" Title  ", artist:"A;B;"};
  const before = JSON.stringify(entry);
  const issues = core.validateSongs([entry]);
  for (const code of ["whitespace", "repeated-space", "artist-separator", "empty-artist-part"])
    assert.ok(issues.some(x => x.code === code), code);
  assert.equal(JSON.stringify(entry), before);
});
test("countdown follows elapsed time including delayed callbacks and background resume", () => {
  assert.deepEqual(plain(core.countdown(1000, 1000)), {remainingMs:45000, seconds:45, progress:1});
  assert.equal(core.countdown(1000, 23456).seconds, 23);
  assert.equal(core.countdown(1000, 90000).progress, 0);
  assert.equal(core.countdown(1000, 90000).seconds, 0);
});
test("random offset reserves 45s plus safety margin and handles short tracks", () => {
  assert.equal(core.randomPosition(180000, 45000, 2000, () => 0.5), 67000);
  assert.throws(() => core.randomPosition(30000), /troppo breve/);
  assert.throws(() => core.randomPosition(undefined), /durata non valida/);
  assert.ok(core.randomPosition(180000,45000,2000,()=>0.999999) < 133000);
});
test("round transitions prevent new scans during play and pending/failed stop", () => {
  const state = new core.RoundState();
  for (const phase of ["opening","scanning","preparing","playing","stopping","stop-error"]) state.move(phase);
  assert.throws(() => state.move("preparing"));
  for (const phase of ["stopping","revealed","opening","scanning"]) state.move(phase);
  assert.throws(() => state.move("revealed"));
});
test("timeouts settle rather than leaving readiness pending", async () => {
  await assert.rejects(core.withTimeout(new Promise(()=>{}), 5, "expired"), /expired/);
});
test("every real dataset row has a lookup or an explicit conflict/validation issue", () => {
  const songs = vm.runInNewContext(sources["song.js"] + "\nwindow.SONGS", {window:{}});
  const catalog = core.createCatalog(songs);
  assert.ok(songs.length > 0);
  songs.forEach((entry, index) => {
    assert.ok(catalog.lookup(entry.id) || catalog.isConflict(entry.id) ||
      catalog.issues.some(issue => issue.row === index + 1 && issue.severity === "error"));
  });
});

function authFixture(initial, fetcher) {
  const c = environment({localStorage:storage(initial), fetch:fetcher});
  load(c, "spotify-auth.js");
  return c;
}
const expired = {"bamboc.spotify.tokens": JSON.stringify({accessToken:"old", refreshToken:"refresh", expiresAt:0})};
test("concurrent token requests share one refresh and preserve missing replacement refresh token", async () => {
  let calls = 0;
  const c = authFixture(expired, async () => { calls++; await delay(2); return response(200, {access_token:"new", expires_in:3600}); });
  const result = await Promise.all([c.Bamboc.auth.getToken(),c.Bamboc.auth.getToken(),c.Bamboc.auth.getToken()]);
  assert.deepEqual(result, ["new","new","new"]); assert.equal(calls,1);
  assert.equal(JSON.parse(c.localStorage.getItem("bamboc.spotify.tokens")).refreshToken,"refresh");
});
test("invalid grant clears only owned keys and requests login", async () => {
  const c = authFixture({...expired, unrelated:"keep"}, async () => response(400));
  await assert.rejects(c.Bamboc.auth.getToken(), c.Bamboc.auth.LoginRequired);
  assert.equal(c.localStorage.getItem("unrelated"),"keep");
});
test("temporary refresh failure keeps refresh token available for retry", async () => {
  const c = authFixture(expired, async () => response(503));
  await assert.rejects(c.Bamboc.auth.getToken(), /503/);
  assert.ok(c.localStorage.getItem("bamboc.spotify.tokens"));
});
test("API refreshes once on 401 and retries original command once", async () => {
  const calls = [];
  const c = authFixture({"bamboc.spotify.tokens":JSON.stringify({accessToken:"old",refreshToken:"r",expiresAt:Date.now()+3600000})},
    async url => { calls.push(url); return url.includes("/api/token") ? response(200,{access_token:"new",expires_in:3600})
      : response(calls.length === 1 ? 401 : 204); });
  await c.Bamboc.auth.api("/me/player");
  assert.equal(calls.length,3);
});
test("API 403/404/429 are explicit and not refresh loops", async () => {
  for (const status of [403,404,429]) {
    let calls = 0;
    const c = authFixture({"bamboc.spotify.tokens":JSON.stringify({accessToken:"a",expiresAt:Date.now()+3600000})},
      async () => {calls++; return response(status,{}, "7");});
    await assert.rejects(c.Bamboc.auth.api("/me/player"), error => error.status === status);
    assert.equal(calls,1);
  }
});
test("PKCE login uses crypto state/challenge and exact redirect path", async () => {
  const c = authFixture({},async()=>response(200));
  await c.Bamboc.auth.login();
  const url = new URL(c.location.assigned);
  const pkce = JSON.parse(c.sessionStorage.getItem("bamboc.spotify.pkce"));
  assert.equal(url.searchParams.get("state"),pkce.state);
  assert.equal(url.searchParams.get("code_challenge_method"),"S256");
  assert.equal(url.searchParams.get("redirect_uri"),"https://test.example/game/");
  assert.equal(pkce.verifier.length,64);
  assert.notEqual(pkce.verifier,pkce.state);
});
test("callback rejects absent verifier, mismatched state and expired transaction before network", async () => {
  for (const pkce of [null, {verifier:"v",state:"wrong",createdAt:Date.now()}, {verifier:"v",state:"s",createdAt:0}]) {
    let calls=0;
    const c = authFixture({}, async()=>{calls++; return response(200);});
    c.location.href = "https://test.example/game/?code=c&state=s";
    if (pkce) c.sessionStorage.setItem("bamboc.spotify.pkce",JSON.stringify(pkce));
    await assert.rejects(c.Bamboc.auth.handleRedirect(), c.Bamboc.auth.LoginRequired);
    assert.equal(calls,0);
    assert.equal(c.sessionStorage.getItem("bamboc.spotify.pkce"),null);
  }
});
test("callback exchanges code and cleans only OAuth parameters", async () => {
  let cleaned;
  const c = authFixture({}, async()=>response(200,{access_token:"a",refresh_token:"r",expires_in:3600}));
  c.location.href="https://test.example/game/?code=c&state=s&debug=1#top";
  c.history.replaceState = (_a,_b,url) => {cleaned=url;};
  c.sessionStorage.setItem("bamboc.spotify.pkce",JSON.stringify({verifier:"v",state:"s",createdAt:Date.now()}));
  await c.Bamboc.auth.handleRedirect();
  assert.equal(cleaned,"/game/?debug=1#top");
  assert.equal(await c.Bamboc.auth.getToken(),"a");
});

function playerFixture(options = {}) {
  const c = environment({sessionStorage: storage(options.cache ? {"bamboc.spotify.durations.v1": options.cache} : {})});
  let instance;
  const calls = [], audio = [], history = [], requests = [], instances = [];
  function record(type, target, extra = {}) {
    const item = {type, volume:target.volume, position:target.state?.position,
      paused:target.state?.paused, disconnected:target.disconnected, ...extra};
    history.push(item);
    if (target.state && !target.state.paused && target.volume > 0 && !target.disconnected)
      audio.push({...item, id:target.state.track_window.current_track.id});
  }
  class FakePlayer {
    constructor(config) {
      this.listeners = {}; this.volume = options.initialVolume ?? config.volume;
      this.state = null; this.disconnected = false;
      this.device = "device" + (instances.length + 1);
      instance = this; instances.push(this);
    }
    addListener(name, callback) { this.listeners[name] = callback; }
    emit(name, value) { this.listeners[name]?.(value); }
    connect() {
      this.disconnected = false;
      if (!options.noReady) this.emit("ready",{device_id:this.device});
      return Promise.resolve(!options.connectFalse);
    }
    disconnect() { this.disconnected = true; calls.push("disconnect"); }
    activateElement() { calls.push("activate"); return Promise.resolve(); }
    getVolume() {
      if (options.volumeReadFail) return Promise.reject(new Error("volume read failed"));
      return Promise.resolve(options.ios ? 1 : this.volume);
    }
    async setVolume(value) {
      calls.push("volume:" + value);
      if (options.muteFail && value === 0) throw new Error("mute failed");
      if (options.restoreFail && value > 0) throw new Error("restore failed");
      if (options.volumeGate && value > 0) await options.volumeGate;
      if (!options.ios) this.volume=value;
      record("volume",this);
    }
    getCurrentState() {
      if (this.state && !this.state.paused && !options.stalled)
        this.state={...this.state,position:this.state.position+25};
      return Promise.resolve(this.state);
    }
    pause() {
      calls.push("pause");
      if (options.pauseFail) return Promise.reject(new Error("pause failed"));
      this.state=this.state ? {...this.state,paused:true} : null;
      record("pause",this);this.emit("player_state_changed",this.state);
      return Promise.resolve();
    }
    async seek(position) {
      calls.push("seek");
      if (options.seekFail) throw new Error("seek failed");
      if (options.seekGate) await options.seekGate;
      if (!options.seekIgnore) this.state={...this.state,position};
      record("seek",this,{requestedPosition:position});
      this.emit("player_state_changed",this.state);
    }
    resume() {
      calls.push("resume");
      if (options.resumeFail) return Promise.reject(new Error("resume failed"));
      this.state={...this.state,paused:false};
      record("resume",this);this.emit("player_state_changed",this.state);
      return Promise.resolve();
    }
  }
  c.Spotify={Player:FakePlayer};
  c.Bamboc.auth = {getToken:async()=>"token", api:async(path, {body,signal} = {})=>{
    calls.push(path);
    if (path.startsWith("/me/player/play")) {
      const device = new URL("https://test" + path).searchParams.get("device_id");
      const target = instances.find(item => item.device === device);
      requests.push({path,body:plain(body),signal,volume:target.volume,device});
      if (options.apiGate) await options.apiGate;
      if (options.silent) return;
      const trackId = options.wrongTrack ? otherId : body.uris[0].split(":").pop();
      target.state={paused:false,loading:false,position:body.position_ms,duration:options.duration ?? 180000,
        track_window:{current_track:{id:trackId,name:"Spotify remaster",artists:[{name:"Spotify artist"}]}}};
      record("play",target);target.emit("player_state_changed",target.state);
    }
  }};
  load(c,"player.js");
  return {c, api:c.Bamboc.playback, calls, audio, history, requests, instances, options,
    get instance(){return instance;},
    setState(value,target=instance) {target.state=value; target.emit("player_state_changed",value);}};
}

test("player accepts ready/event before connect/HTTP resolves; metadata endpoint never requested", async () => {
  const f=playerFixture();
  await f.api.prepare();
  const at=await f.api.play({...song,durationMs:180000});
  assert.ok(at<=Date.now());
  assert.equal(f.calls.filter(x=>x==="/me/player").length,1);
  assert.equal(f.calls.some(x=>x.includes("/tracks")),false);
  await f.api.stop();
});
test("unknown duration loads muted then parks; next round uses cached offset without transfer", async () => {
  const f=playerFixture();
  await f.api.play(song); await f.api.stop(); await f.api.play(song); await f.api.stop();
  assert.equal(f.calls.filter(x=>x==="seek").length,2);
  assert.equal(f.requests[0].body.position_ms,0);
  assert.ok(f.requests[1].body.position_ms>=1000);
  assert.equal(f.calls.filter(x=>x==="/me/player").length,1);
  assert.equal(f.calls.filter(x=>x.startsWith("/me/player/play")).length,2);
});
test("wrong-track playback is never confirmation and timeout is explicit", async () => {
  const f=playerFixture({wrongTrack:true});
  await assert.rejects(f.api.play({...song,durationMs:180000}), /non confermata/);
});
test("missing ready and connect false reject within deadline", async () => {
  const f=playerFixture({noReady:true});
  await assert.rejects(f.api.prepare(), /non pronto/);
  const g=playerFixture({connectFalse:true});
  await assert.rejects(g.api.prepare(), /non riuscita/);
});
test("not_ready invalidates device and next prepare reconnects", async () => {
  const f=playerFixture();
  await f.api.prepare();
  f.instance.emit("not_ready",{device_id:f.instance.device});
  await f.api.prepare();
  await f.api.play({...song,durationMs:180000}); await f.api.stop();
  assert.ok(f.calls.includes("/me/player"));
});
test("autoplay failure rejects current playback waiter and permits next attempt", async () => {
  const f=playerFixture({silent:true}); await f.api.prepare();
  const play=f.api.play(song);
  await delay(2); f.instance.emit("autoplay_failed");
  await assert.rejects(play,/Audio bloccato/);
  await f.api.stop();
});
test("pause failure is propagated to prevent a new round", async () => {
  const f=playerFixture(); await f.api.play({...song,durationMs:180000});
  f.options.pauseFail=true;
  await assert.rejects(f.api.stop(), /pause failed/);
});
test("relinked track identity is accepted without using Spotify editorial fields", () => {
  const f=playerFixture();
  assert.equal(f.api.matches({track_window:{current_track:{id:otherId,linked_from:{id}}}},id),true);
});

function scannerFixture(options = {}) {
  let instance, starts=0, stops=0;
  const c=environment({isSecureContext:true});
  class FakeScanner {
    constructor(){instance=this;}
    async start(camera, config, success) {
      starts++; this.decoded=success;
      if (options.permission) throw new Error("NotAllowedError: permission denied");
      if (options.fallback && starts===1) throw new Error("OverconstrainedError");
    }
    async stop(){stops++;}
    clear(){}
    static async getCameras(){return [{id:"rear",label:"posteriore"}];}
  }
  c.Html5Qrcode=FakeScanner; c.Html5QrcodeSupportedFormats={QR_CODE:0};
  load(c,"scanner.js");
  return {api:c.Bamboc.scanner,get instance(){return instance;},get starts(){return starts;},get stops(){return stops;}};
}
test("scanner locks duplicate detections, unlocks rejected QR, and restarts", async () => {
  const f=scannerFixture(); let scans=0,accept=false;
  await f.api.start(async()=>{scans++;return accept;},error=>{throw error;});
  f.instance.decoded("bad");f.instance.decoded("bad");await delay(0);
  assert.equal(scans,1);
  accept=true;f.instance.decoded("good");f.instance.decoded("good");await delay(0);
  assert.equal(scans,2); f.instance.decoded("good");assert.equal(scans,2);
  await f.api.stop(); await f.api.start(async()=>false,()=>{}); await f.api.stop();
  assert.equal(f.stops,2);
});
test("scanner rejection recovers lock and camera permission is not retried repeatedly", async () => {
  const f=scannerFixture();let errors=0;
  await f.api.start(async()=>{throw new Error("test");},()=>{errors++;});
  f.instance.decoded("x");await delay(0);f.instance.decoded("x");await delay(0);
  assert.equal(errors,2);await f.api.stop();
  const g=scannerFixture({permission:true});
  await assert.rejects(g.api.start(()=>{},()=>{}),/negato/);assert.equal(g.starts,1);
});
test("scanner camera constraint failure uses rear-camera fallback", async () => {
  const f=scannerFixture({fallback:true});await f.api.start(()=>false,()=>{});
  assert.equal(f.starts,2);await f.api.stop();
});

function fakeClock() {
  let time=0, sequence=0;
  const jobs=new Map();
  const clock={
    now:()=>time,
    schedule(fn,ms=0){const id=++sequence;jobs.set(id,{at:time+ms,fn});return id;},
    unschedule(id){jobs.delete(id);},
    async advance(ms) {
      const until=time+ms;
      for (;;) {
        const next=[...jobs].filter(([,job])=>job.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];
        if (!next) break;
        time=next[1].at;jobs.delete(next[0]);next[1].fn();
        await flush();
      }
      time=until;await flush();
    },
    get pending(){return jobs.size;},
  };
  clock.Date=class extends Date { static now(){return time;} };
  return clock;
}
async function flush() { for(let i=0;i<30;i++) await Promise.resolve(); }
function appFixture({clock, preplayMs=0, songs=[song]} = {}) {
  const elements = new Map(), listeners = {}, docListeners = {}, windowListeners = {};
  function element(id) {
    if (!elements.has(id)) elements.set(id,{
      hidden:false,disabled:false,textContent:"",style:{},children:[],isConnected:true,classList:{add(){},toggle(){}},
      addEventListener(type, fn){listeners[id+":"+type]=fn;},setAttribute(){},focus(){},
      append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},
    });
    return elements.get(id);
  }
  const c=environment({
    document:{title:"Test",getElementById:element,createElement:()=>element("created"+elements.size),
      addEventListener:(name,fn)=>{docListeners[name]=fn;}},
    navigator:{},addEventListener:(name,fn)=>{windowListeners[name]=fn;},
    requestAnimationFrame:()=>1,cancelAnimationFrame(){},SONGS:songs,
    ...(clock ? {Date:clock.Date,setTimeout:clock.schedule,clearTimeout:clock.unschedule} : {}),
  });
  c.Bamboc.config.preplayMs=preplayMs;
  if (clock) c.Bamboc.core={...core,preplayCountdown:(duration,tick,options)=>
    core.preplayCountdown(duration,tick,{...options,now:clock.now,schedule:clock.schedule,unschedule:clock.unschedule})};
  const calls=[]; let decoded, pause=Promise.resolve(), nextPlay=Promise.resolve(null), errors, states;
  c.Bamboc.auth={handleRedirect:async()=>{},getToken:async()=>"a",LoginRequired:class extends Error{},login:async()=>{}};
  c.Bamboc.scanner={start:async callback=>{decoded=callback;calls.push("scan");},stop:async()=>{calls.push("camera stop");}};
  c.Bamboc.playback={
    activate:()=>{calls.push("activate");return Promise.resolve();},prepare:async()=>{},
    ensureActive:async()=>{},
    play:async(_song,_trace,{signal,readyToStart})=>{
      calls.push("play");
      const [timestamp]=await core.abortable(Promise.all([nextPlay,readyToStart]),signal);
      return timestamp ?? c.Date.now();
    },
    stop:()=>{calls.push("pause");return pause;},disconnect(){calls.push("disconnect");},matches:()=>true,
    onError:fn=>{errors=fn;},onState:fn=>{states=fn;},
  };
  load(c,"app.js");
  return {c,element,calls,click:id=>listeners[id+":click"](),scan:text=>decoded(text),
    setPause:value=>{pause=value;},setPlay:value=>{nextPlay=value;},
    error:()=>errors(new Error("offline")),state:value=>states(value),
    get decoded(){return decoded;},
    visibility:hidden=>{c.document.hidden=hidden;docListeners.visibilitychange();},
    pagehide:()=>windowListeners.pagehide()};
}

test("full simulated login -> scan -> play -> reveal -> next serializes pause and keeps local metadata", async () => {
  const f=appFixture();await delay(0);
  assert.equal(f.element("game-screen").hidden,false);
  f.click("scan-btn");await delay(0);
  assert.equal(await f.scan("https://open.spotify.com/track/"+otherId),false);
  assert.equal(f.calls.includes("play"),false);
  await f.scan("spotify:track:"+id);
  assert.equal(f.element("countdown").textContent,"45");
  const pending=defer();f.setPause(pending.promise);
  f.click("reveal-btn");f.click("reset-btn");await delay(0);
  assert.equal(f.element("reset-btn").disabled,true);
  assert.equal(f.calls.filter(x=>x==="scan").length,1);
  const back=f.element("result").children[0].children[1];
  assert.deepEqual(back.children.map(x=>x.textContent),[song.title,song.artist,song.year]);
  pending.resolve();await delay(0);f.click("reset-btn");await delay(0);
  assert.equal(f.calls.filter(x=>x==="scan").length,2);
  f.click("cancel-btn");await delay(0);
});
test("timer never starts while playback unconfirmed; duplicate scan cannot start second round", async () => {
  const f=appFixture();await delay(0);f.click("scan-btn");await delay(0);
  const pending=defer();f.setPlay(pending.promise);
  const scan=f.scan("spotify:track:"+id);await delay(0);
  assert.equal(f.element("timer").hidden,true);
  await f.scan("spotify:track:"+id);
  assert.equal(f.calls.filter(x=>x==="play").length,1);
  pending.resolve(Date.now());await scan;
  f.click("reveal-btn");await delay(0);
});
test("failed stop leaves retry action and blocks NEXT until confirmed", async () => {
  const f=appFixture();await delay(0);f.click("scan-btn");await delay(0);await f.scan("spotify:track:"+id);
  const failed=Promise.reject(new Error("pause"));failed.catch(()=>{});f.setPause(failed);
  f.click("reveal-btn");await delay(0);
  assert.equal(f.element("reset-btn").textContent,"RIPROVA STOP");
  f.setPause(Promise.resolve());f.click("reset-btn");await delay(0);
  assert.equal(f.element("reset-btn").textContent,"NEXT SONG");
});
test("expired confirmed timestamp automatically reveals without waiting 45 callback ticks", async () => {
  const f=appFixture();await delay(0);f.click("scan-btn");await delay(0);
  f.setPlay(Promise.resolve(Date.now()-46000));await f.scan("spotify:track:"+id);await delay(0);
  assert.equal(f.element("reset-btn").textContent,"NEXT SONG");
  assert.equal(f.element("result").hidden,false);
});


test("SDK authentication/account/initialization/playback errors settle pending playback", async () => {
  for (const type of ["authentication_error","account_error","initialization_error","playback_error"]) {
    const f=playerFixture({silent:true});await f.api.prepare();
    const play=f.api.play(song);await delay(2);
    f.instance.emit(type,{message:"failure"});
    await assert.rejects(play);
    await f.api.stop();
  }
});
test("404 playback performs one transfer recovery, never a metadata request", async () => {
  const f=playerFixture();let attempts=0;
  const api=f.c.Bamboc.auth.api;
  f.c.Bamboc.auth.api=async(path,options)=>{
    if (path.startsWith("/me/player/play") && attempts++===0) {
      const error=new Error("device gone");error.status=404;throw error;
    }
    return api(path,options);
  };
  await f.api.play({...song,durationMs:180000});await f.api.stop();
  assert.equal(attempts,2);
  assert.equal(f.calls.filter(x=>x==="/me/player").length,2);
});
test("stale duration that could seek too near the end is corrected using SDK duration", async () => {
  const f=playerFixture();
  const original = core.randomPosition;
  core.randomPosition = (duration, round, margin) => original(duration, round, margin, () => 0.9);
  try {
    await f.api.play({...song,durationMs:1000000000});await f.api.stop();
    const seek=f.history.find(entry=>entry.type==="seek");
    assert.ok(f.requests[0].body.position_ms>180000);
    assert.ok(seek.requestedPosition>=1000 && seek.requestedPosition<=133000);
  } finally { core.randomPosition = original; }
});
test("OAuth cancellation returns explicit login error without token exchange", async () => {
  let calls=0;
  const c=authFixture({},async()=>{calls++;return response(200);});
  c.location.href="https://test.example/game/?error=access_denied&state=s";
  c.sessionStorage.setItem("bamboc.spotify.pkce",JSON.stringify({verifier:"v",state:"s",createdAt:Date.now()}));
  await assert.rejects(c.Bamboc.auth.handleRedirect(),/annullato/);
  assert.equal(calls,0);
});
test("request timeout aborts fetch and allows a later attempt", async () => {
  const c=authFixture(expired,(_url,options)=>new Promise((_resolve,reject)=>{
    options.signal.addEventListener("abort",()=>{const error=new Error("aborted");error.name="AbortError";reject(error);});
  }));
  c.Bamboc.config.requestTimeoutMs=5;
  await assert.rejects(c.Bamboc.auth.getToken(),/Timeout/);
});
test("failed playback resets to SCAN only after cleanup", async () => {
  const f=appFixture();await delay(0);f.click("scan-btn");await delay(0);
  const error=Promise.reject(new Error("play failed"));error.catch(()=>{});f.setPlay(error);
  await f.scan("spotify:track:"+id);
  assert.equal(f.element("scan-btn").hidden,false);
  assert.equal(f.element("timer").hidden,true);
  assert.equal(f.calls.filter(x=>x==="pause").length,1);
});
test("cancelling a scan ignores an already queued QR callback", async () => {
  const f=appFixture();await delay(0);f.click("scan-btn");await delay(0);
  f.click("cancel-btn");await f.scan("spotify:track:"+id);await delay(0);
  assert.equal(f.calls.includes("play"),false);
});
test("heuristic typo/truncated artist warnings never rewrite supplied text", () => {
  const entries=[{...song,title:"Smooth Criminalr"},{...song,title:"un estate al mare"},
    {...song,title:"Siamo Una Squadra Fortissimi",artist:"Siamo Una Squadra Fo"}];
  const issues=core.validateSongs(entries);
  assert.equal(issues.filter(x=>x.code==="possible-title-typo").length,2);
  assert.equal(issues.filter(x=>x.code==="possibly-truncated-artist").length,1);
  assert.equal(entries[0].title,"Smooth Criminalr");
});


test("timed-out pause is reused on STOP retry, so no late duplicate pause can reach the next round", async () => {
  const f=playerFixture();await f.api.play({...song,durationMs:180000});
  const pending=defer();let calls=0;
  f.instance.pause=()=>{calls++;return pending.promise;};
  await assert.rejects(f.api.stop(),/Pausa non confermata/);
  const retry=f.api.stop();
  f.setState(null);
  pending.resolve();
  await retry;
  assert.equal(calls,1);
});

test("mute readback precedes transfer and play; VIA callback precedes unmute", async () => {
  const f=playerFixture();let via=false;
  await f.api.play(song,()=>{}, {onStarting(){
    via=true;assert.equal(f.instance.volume,0);assert.equal(f.audio.length,0);
    assert.ok(f.instance.state.position>=1000);assert.equal(f.instance.state.paused,false);
  }});
  assert.equal(via,true);
  assert.ok(f.calls.indexOf("volume:0")<f.calls.indexOf("/me/player"));
  assert.equal(f.requests[0].volume,0);
  assert.ok(f.audio.every(entry=>entry.position>=1000));
  assert.equal(f.instance.volume,0.8);await f.api.stop();
});
test("known duration sends random position in first play request", async () => {
  const f=playerFixture();await f.api.play({...song,durationMs:180000});
  assert.ok(f.requests[0].body.position_ms>=1000);
  assert.ok(f.requests[0].body.position_ms<=133000);await f.api.stop();
});
test("duration cache is keyed by track and saved from matching SDK state", async () => {
  const f=playerFixture();await f.api.play(song);await f.api.stop();
  await f.api.play({...song,id:otherId});await f.api.stop();
  assert.deepEqual(f.requests.map(x=>x.body.position_ms),[0,0]);
  const cache=JSON.parse(f.c.sessionStorage.getItem("bamboc.spotify.durations.v1"));
  assert.deepEqual(cache,[[id,180000],[otherId,180000]]);
});
test("corrupt persisted durations are ignored rather than used as offsets", async () => {
  for(const cache of ['null','{broken',JSON.stringify([[id,-1],[otherId,180000]])]) {
    const f=playerFixture({cache});await f.api.play(song);
    assert.equal(f.requests[0].body.position_ms,0);await f.api.stop();
  }
});
test("uncontrollable/mute-failing volume blocks transfer and track load", async () => {
  for(const options of [{ios:true},{muteFail:true},{volumeReadFail:true},{initialVolume:0}]) {
    const f=playerFixture(options);await assert.rejects(f.api.play(song));
    assert.equal(f.requests.length,0);assert.equal(f.calls.includes("/me/player"),false);
  }
});
test("preparation failures retire muted device and preserve volume for replacement", async () => {
  for(const options of [{seekFail:true},{pauseFail:true},{resumeFail:true},{restoreFail:true},
    {seekIgnore:true},{stalled:true},{duration:0},{duration:30000}]) {
    const f=playerFixture(options);await assert.rejects(f.api.play(song));
    const retired=f.instance;assert.equal(retired.disconnected,true);
    assert.equal(f.audio.length,0);
    await f.api.prepare();assert.notEqual(f.instance,retired);assert.equal(f.instance.volume,0.8);
    f.api.disconnect();
  }
});
test("countdown gate parks track muted, and cancellation cannot resume it", async () => {
  const gate=defer(), controller=new AbortController(), f=playerFixture();
  const pending=f.api.play(song,()=>{}, {signal:controller.signal,readyToStart:gate.promise});
  await delay(15);assert.equal(f.audio.length,0);assert.equal(f.calls.includes("resume"),false);
  assert.equal(f.instance.state.paused,true);
  controller.abort(new Error("cancel"));await assert.rejects(pending,/cancel/);
  gate.resolve();await delay(0);assert.equal(f.calls.includes("resume"),false);
  assert.equal(f.instance.disconnected,true);
});
test("late seek from cancelled A targets retired instance, never B", async () => {
  const gate=defer(), controller=new AbortController(), f=playerFixture({seekGate:gate.promise});
  const pending=f.api.play(song,()=>{}, {signal:controller.signal});await delay(15);
  const old=f.instance;controller.abort(new Error("cancel"));await assert.rejects(pending);
  f.options.seekGate=null;
  await f.api.play({...song,id:otherId});const current=f.instance;
  gate.resolve();await delay(0);
  assert.notEqual(current,old);assert.equal(old.disconnected,true);
  assert.equal(current.state.track_window.current_track.id,otherId);assert.equal(current.state.paused,false);
  await f.api.stop();
});
test("late HTTP A and SDK events are isolated from round B", async () => {
  const gate=defer(), controller=new AbortController(), f=playerFixture({apiGate:gate.promise});
  const pending=f.api.play(song,()=>{}, {signal:controller.signal});await delay(15);
  const old=f.instance;controller.abort(new Error("cancel"));await assert.rejects(pending);
  f.options.apiGate=null;await f.api.play({...song,id:otherId});
  const current=f.instance;gate.resolve();await delay(0);old.emit("not_ready",{});
  assert.equal(current.disconnected,false);assert.equal(current.state.paused,false);
  assert.equal(current.state.track_window.current_track.id,otherId);await f.api.stop();
});
test("conflicting QR never leaves scanner or requests playback", async () => {
  const f=appFixture({songs:[song,{...song,title:"Conflict"}]});await delay(0);
  f.click("scan-btn");await delay(0);assert.equal(await f.scan("spotify:track:"+id),false);
  assert.equal(f.calls.includes("play"),false);assert.equal(f.element("scanner-container").hidden,false);
  f.click("cancel-btn");await delay(0);
});
test("fast preparation waits 3-2-1; reveal and timer stay disabled", async () => {
  const clock=fakeClock(), f=appFixture({clock,preplayMs:3000});await flush();
  f.click("scan-btn");await flush();const pending=f.scan("spotify:track:"+id);await flush();
  for(const expected of ["3","2","1"]) {
    assert.equal(f.element("preplay-count").textContent,expected);
    assert.equal(f.element("reveal-btn").disabled,true);assert.equal(f.element("timer").hidden,true);
    f.click("reveal-btn");await clock.advance(1000);
  }
  await pending;assert.equal(f.element("countdown").textContent,"45");
  assert.equal(f.element("go-label").hidden,false);f.click("reveal-btn");await flush();
  assert.equal(clock.pending,0);
});
test("slow preparation shows PREPARAZIONE until playback confirmed", async () => {
  const clock=fakeClock(), gate=defer(), f=appFixture({clock,preplayMs:3000});await flush();
  f.setPlay(gate.promise);f.click("scan-btn");await flush();const pending=f.scan("spotify:track:"+id);
  await clock.advance(3000);assert.equal(f.element("preplay-count").textContent,"PREPARAZIONE…");
  assert.equal(f.element("go-label").hidden,true);assert.equal(f.element("timer").hidden,true);
  gate.resolve(null);await pending;assert.equal(f.element("countdown").textContent,"45");
  f.click("reveal-btn");await flush();assert.equal(clock.pending,0);
});
test("reset during PREPARING cancels clock and ignores late completion", async () => {
  const clock=fakeClock(), gate=defer(), f=appFixture({clock,preplayMs:3000});await flush();
  f.setPlay(gate.promise);f.click("scan-btn");await flush();const pending=f.scan("spotify:track:"+id);
  f.click("cancel-btn");await flush();gate.resolve(null);await pending;await clock.advance(5000);
  assert.equal(f.element("timer").hidden,true);assert.equal(f.element("scan-btn").hidden,false);
  assert.equal(clock.pending,0);
});
test("old scanner callback cannot consume QR after NEXT starts a new session", async () => {
  const f=appFixture();await delay(0);f.click("scan-btn");await delay(0);const stale=f.decoded;
  await f.scan("spotify:track:"+id);f.click("reveal-btn");await delay(0);
  f.click("reset-btn");await delay(0);await stale("spotify:track:"+id);
  assert.equal(f.calls.filter(x=>x==="play").length,1);f.click("cancel-btn");await delay(0);
});
test("background cancels camera; 45-second deadline auto-reveals and cleans timers", async () => {
  const clock=fakeClock(),f=appFixture({clock});await flush();f.click("scan-btn");await flush();
  f.visibility(true);await flush();assert.equal(f.element("scan-btn").hidden,false);
  f.visibility(false);f.click("scan-btn");await flush();await f.scan("spotify:track:"+id);
  await clock.advance(44999);assert.equal(f.element("result").hidden,true);
  await clock.advance(1);assert.equal(f.element("result").hidden,false);assert.equal(clock.pending,0);
});
test("logout during refresh cannot resurrect tokens and removes legacy owned keys only", async () => {
  const gate=defer(),c=authFixture({...expired,refresh_token:"legacy",token_expires_at:"0",unrelated:"keep"},()=>gate.promise);
  const pending=c.Bamboc.auth.getToken();c.Bamboc.auth.clear();
  gate.resolve(response(200,{access_token:"late",expires_in:3600}));await assert.rejects(pending,/annullata/);
  assert.equal(c.localStorage.getItem("bamboc.spotify.tokens"),null);
  assert.equal(c.localStorage.getItem("refresh_token"),null);assert.equal(c.localStorage.getItem("unrelated"),"keep");
});

test("stale paused event payload on retained device cannot stop new playback", async () => {
  const f=playerFixture();await f.api.play(song);await f.api.stop();
  const oldState={...f.instance.state};await f.api.play({...song,id:otherId});
  const states=[];const unsubscribe=f.api.onState(state=>states.push(state));
  f.instance.emit("player_state_changed",oldState);await flush();
  assert.ok(states.length>0);assert.ok(states.every(state=>!state.paused && state.track_window.current_track.id===otherId));
  unsubscribe();await f.api.stop();
});
test("failed track load and mid-preparation device change retire the device", async () => {
  const f=playerFixture();const api=f.c.Bamboc.auth.api;
  f.c.Bamboc.auth.api=(path,options)=>path.startsWith("/me/player/play") ? Promise.reject(new Error("play failed")) : api(path,options);
  await assert.rejects(f.api.play(song),/play failed/);assert.equal(f.instance.disconnected,true);
  const gate=defer(),g=playerFixture();const pending=g.api.play(song,()=>{},{readyToStart:gate.promise});
  await delay(15);g.instance.emit("ready",{device_id:"replacement"});
  await assert.rejects(pending,/cambiato/);assert.equal(g.instance.disconnected,true);gate.resolve();
});

test("camera shutdown failure prevents PLAYING and exposes retry STOP", async () => {
  const f=appFixture();await delay(0);f.click("scan-btn");await delay(0);
  f.c.Bamboc.scanner.stop=async()=>{throw new Error("camera stop failed");};
  await f.scan("spotify:track:"+id);
  assert.equal(f.element("timer").hidden,true);assert.equal(f.element("reveal-btn").disabled,true);
  assert.equal(f.element("reset-btn").textContent,"RIPROVA STOP");
});

let failures=0;
export const results = [];
for (const {name,run} of tests) {
  try {await run();results.push({name, passed:true});console.log("PASS " + name);}
  catch(error) {failures++;results.push({name, passed:false, error:error.stack});console.error("FAIL "+name+"\n"+error.stack);}
}
console.log(tests.length + " tests; " + failures + " failures.");
if (failures) throw new Error(JSON.stringify(results.filter(result => !result.passed), null, 2));
