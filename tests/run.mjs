import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const root = new URL("../", import.meta.url);
const coreModule = { exports: {} };
vm.runInNewContext(await readFile(new URL("core.js", root), "utf8"), { module: coreModule, URL, setTimeout, clearTimeout });
const core = coreModule.exports;
const sources = Object.fromEntries(await Promise.all(
  ["config.js", "tests/support/browser-observer.js", "tests/support/oauth-observer.js", "spotify-auth.js", "player.js", "scanner.js", "app.js", "song.js"]
    .map(async name => [name, await readFile(new URL(name, root), "utf8")])
));
const tests = [];
const test = (name, run) => tests.push({ name, run });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const defer = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; };
const id = "4g7ASoGYRujjvNL6DHX9j8", otherId = "3yGyWqmw9eCQPdJJ6iJLWs";
const song = { id, title: "Editorial title", artist: "Editorial artist", year: "1963", durationMs: 180000 };
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
    requestTimeoutMs: 80, pollMs: 5, debug: !extra.production };
  context.Bamboc.core = core;
  if (!extra.production) {
    vm.runInContext(sources["tests/support/browser-observer.js"], context);
    vm.runInContext(sources["tests/support/oauth-observer.js"], context);
  }
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
test("failed refresh clears session and requires a fresh login, including temporary errors", async () => {
  const c = authFixture(expired, async () => response(503));
  await assert.rejects(c.Bamboc.auth.getToken(), /503/);
  assert.equal(c.localStorage.getItem("bamboc.spotify.tokens"),null);
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
    const c = authFixture({"bamboc.spotify.tokens":JSON.stringify({accessToken:"a",refreshToken:"r",expiresAt:Date.now()+3600000})},
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
  const c = environment({sessionStorage: storage(options.cache ? {"bamboc.spotify.durations.v1": options.cache} : {}),
    localStorage: storage(options.tokens || {}), fetch: options.fetcher, production: options.production});
  let instance;
  const calls = [], audio = [], history = [], requests = [], instances = [];
  function record(type, target, extra = {}) {
    const item = {type, volume:target.volume, position:target.state?.position,
      paused:target.state?.paused, disconnected:target.disconnected, ...extra};
    history.push(item);
    if (target.state && !target.state.paused && (target.volume > 0 || options.physicalMuteUnsupported) && !target.disconnected)
      audio.push({...item, id:target.state.track_window.current_track.id});
  }
  class FakePlayer {
    constructor(config) {
      this.oauthToken = config.getOAuthToken;
      this.listeners = {}; this.volume = options.initialVolume ?? config.volume;
      this.state = null; this.disconnected = false;
      this.device = "device" + (instances.length + 1);
      instance = this; instances.push(this);
    }
    addListener(name, callback) { this.listeners[name] = callback; }
    removeListener(name) { delete this.listeners[name]; }
    emit(name, value) { this.listeners[name]?.(value); }
    connect() {
      this.disconnected = false;
      if (options.authError) this.emit("authentication_error",{});
      else if (!options.noReady) this.emit("ready",{device_id:options.readyDevice ?? this.device});
      return options.connectGate || Promise.resolve(!options.connectFalse);
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
  c.Bamboc.auth = {getToken:async()=>"token", hasValidToken:()=>true, onInvalidated:()=>()=>{},
    LoginRequired:class extends core.SpotifyError {constructor(message){super("AUTH_REQUIRED",message);}},
    api:async(path, {body,signal} = {})=>{
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
  if (options.realAuth) {
    const transport=c.Bamboc.auth.api;
    if (!options.fetcher) c.fetch=async(url,request)=>{
      await transport(url.replace("https://api.spotify.com/v1",""),{
        body:request.body ? JSON.parse(request.body) : undefined,signal:request.signal});
      return response(204);
    };
    load(c,"spotify-auth.js");
  }
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
  assert.equal(f.calls.filter(x=>x==="/me/player").length,0);
  assert.equal(f.calls.some(x=>x.includes("/tracks")),false);
  await f.api.stop();
});
test("missing duration blocks without play even when legacy SDK cache contains duration", async()=>{
 const f=playerFixture({cache:JSON.stringify([[id,180000]])});
 await assert.rejects(f.api.play({...song,durationMs:undefined}),e=>e.code==="LOCAL_DURATION_MISSING");
 assert.equal(f.requests.length,0);assert.equal(f.calls.includes("seek"),false);
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
  assert.ok(f.calls.some(x=>x.startsWith("/me/player/play")));
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
function appFixture({clock, preplayMs=0, songs=[song], context, realSession=false} = {}) {
  const elements = new Map(), listeners = {}, docListeners = {}, windowListeners = {};
  function element(id) {
    if (context?.production && /diagnostic/.test(id)) throw new Error("Removed diagnostic selector: " + id);
    if (!elements.has(id)) elements.set(id,{
      hidden:false,disabled:false,textContent:"",style:{},children:[],isConnected:true,classList:{add(){},toggle(){}},
      attributes:{},addEventListener(type, fn){listeners[id+":"+type]=fn;},setAttribute(key,value){this.attributes[key]=value;},focus(){},
      append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},
    });
    return elements.get(id);
  }
  const extras={
    document:{title:"Test",getElementById:element,createElement:()=>element("created"+elements.size),
      addEventListener:(name,fn)=>{docListeners[name]=fn;}},
    navigator:context?.navigator || {},addEventListener:(name,fn)=>{windowListeners[name]=fn;},
    requestAnimationFrame:()=>1,cancelAnimationFrame(){},SONGS:songs,
    ...(clock ? {Date:clock.Date,setTimeout:clock.schedule,clearTimeout:clock.unschedule} : {}),
  };
  const c=context ? Object.assign(context,extras) : environment(extras);
  c.Bamboc.config.preplayMs=preplayMs;
  if (clock) c.Bamboc.core={...core,preplayCountdown:(duration,tick,options)=>
    core.preplayCountdown(duration,tick,{...options,now:clock.now,schedule:clock.schedule,unschedule:clock.unschedule})};
  const calls=[]; let decoded, pause=Promise.resolve(), nextPlay=Promise.resolve(null), errors, states;
  if (!realSession) c.Bamboc.auth={handleRedirect:async()=>{},getToken:async()=>"a",hasValidToken:()=>true,
    onInvalidated:()=>()=>{},clear(){},LoginRequired:class extends Error{},login:async()=>{}};
  c.Bamboc.scanner={start:async callback=>{decoded=callback;calls.push("scan");},stop:async()=>{calls.push("camera stop");}};
  if (!realSession) c.Bamboc.playback={
    isReady:()=>true,resetSession(){calls.push("disconnect");},
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
  assert.equal(f.element("reset-btn").textContent,"PROSSIMA CARTA");
});
test("expired confirmed timestamp automatically reveals without waiting 45 callback ticks", async () => {
  const f=appFixture();await delay(0);f.click("scan-btn");await delay(0);
  f.setPlay(Promise.resolve(Date.now()-46000));await f.scan("spotify:track:"+id);await delay(0);
  assert.equal(f.element("reset-btn").textContent,"PROSSIMA CARTA");
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
test("404 playback fails explicitly without retry, seek or metadata request", async()=>{
 const f=playerFixture();let attempts=0;const api=f.c.Bamboc.auth.api;
 f.c.Bamboc.auth.api=async(path,options)=>{if(path.startsWith("/me/player/play")){attempts++;const e=new Error("device gone");e.status=404;throw e;}return api(path,options);};
 await assert.rejects(f.api.play(song));assert.equal(attempts,1);assert.equal(f.calls.some(x=>x.includes("tracks")),false);
});
test("inconsistent local duration fails explicitly without seeking or replaying", async()=>{
 const f=playerFixture();const original=core.randomPosition;
 core.randomPosition=(duration,round,margin)=>original(duration,round,margin,()=>0.9);
 try{await assert.rejects(f.api.play({...song,durationMs:1000000000}),e=>e.code==="LOCAL_DURATION_MISMATCH");
 assert.equal(f.requests.length,1);assert.equal(f.calls.includes("seek"),false);}finally{core.randomPosition=original;}
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

test("direct playback uses no volume manipulation or preparatory transport commands", async()=>{
 const f=playerFixture({physicalMuteUnsupported:true});await f.api.play(song);
 assert.equal(f.requests.length,1);assert.ok(f.audio.every(x=>x.position>=1000));
 assert.equal(f.calls.some(x=>/^(volume:|pause$|seek$|resume$)/.test(x)),false);await f.api.stop();
});
test("known duration sends random position in first play request", async () => {
  const f=playerFixture();await f.api.play({...song,durationMs:180000});
  assert.ok(f.requests[0].body.position_ms>=1000);
  assert.ok(f.requests[0].body.position_ms<=133000);await f.api.stop();
});
test("each track uses its own local duration and no SDK duration cache is written", async()=>{
 const f=playerFixture();await f.api.play(song);await f.api.stop();
 await f.api.play({...song,id:otherId,durationMs:60000});await f.api.stop();
 assert.ok(f.requests[0].body.position_ms<=133000);assert.ok(f.requests[1].body.position_ms<=13000);
 assert.equal(f.c.sessionStorage.getItem("bamboc.spotify.durations.v1"),null);
});
test("legacy duration cache never substitutes for missing verified local duration", async()=>{
 for(const cache of ['null','{broken',JSON.stringify([[id,180000]])]){
 const f=playerFixture({cache});await assert.rejects(f.api.play({...song,durationMs:undefined}),e=>e.code==="LOCAL_DURATION_MISSING");
 assert.equal(f.requests.length,0);}
});
test("mobile volume limitations do not require mute, pause, seek or resume for direct start", async()=>{
 for(const options of [{ios:true},{muteFail:true},{volumeReadFail:true},{seekFail:true},{resumeFail:true}]){
 const f=playerFixture(options);await f.api.play(song);assert.ok(f.requests[0].body.position_ms>=1000);
 assert.equal(f.calls.some(x=>/^(volume:|seek$|resume$)/.test(x)),false);await f.api.stop();}
});
test("unconfirmed direct playback retires device before allowing a replacement", async()=>{
 for(const options of [{stalled:true},{wrongTrack:true},{duration:1000}]){
 const f=playerFixture(options);await assert.rejects(f.api.play(song));const old=f.instance;
 assert.equal(old.disconnected,true);await f.api.prepare();assert.notEqual(f.instance,old);f.api.disconnect();}
});
test("countdown cancellation sends no playback even if the countdown promise resolves later", async()=>{
 const gate=defer(),controller=new AbortController(),f=playerFixture();
 const pending=f.api.play(song,()=>{},{signal:controller.signal,readyToStart:gate.promise});
 await delay(15);assert.equal(f.requests.length,0);assert.equal(f.instance.state,null);
 controller.abort(new Error("cancel"));await assert.rejects(pending,/cancel/);gate.resolve();await delay(0);
 assert.equal(f.requests.length,0);assert.equal(f.instance.disconnected,true);
});
test("late preparation gate cannot issue pause, seek or playback against round B", async()=>{
 const gate=defer(),controller=new AbortController(),f=playerFixture();
 const pending=f.api.play(song,()=>{},{signal:controller.signal,readyToStart:gate.promise});await delay(15);
 const old=f.instance;controller.abort(new Error("cancel"));await assert.rejects(pending);
 await f.api.play({...song,id:otherId});const current=f.instance;gate.resolve();await delay(0);
 assert.notEqual(current,old);assert.equal(current.state.paused,false);assert.equal(f.requests.length,1);
 assert.equal(f.calls.includes("pause"),false);assert.equal(f.calls.includes("seek"),false);await f.api.stop();
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
  assert.equal(f.element("go-label").hidden,true);f.click("reveal-btn");await flush();
  assert.equal(clock.pending,0);
});
test("slow preparation hides countdown after 1 until playback confirmed", async () => {
  const clock=fakeClock(), gate=defer(), f=appFixture({clock,preplayMs:3000});await flush();
  f.setPlay(gate.promise);f.click("scan-btn");await flush();const pending=f.scan("spotify:track:"+id);
  await clock.advance(3000);assert.equal(f.element("preplay-count").textContent,"1");
  assert.equal(f.element("preplay").hidden,true);
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

const savedSession = () => ({"bamboc.spotify.tokens":JSON.stringify({accessToken:"saved",refreshToken:"refresh",expiresAt:Date.now()+3600000})});
function sessionFixture(options={}) {
  const player=playerFixture({realAuth:true,tokens:savedSession(),...options});
  if(options.callback) {
    player.c.location.href=options.callback;
    if(options.pkce) player.c.sessionStorage.setItem("bamboc.spotify.pkce",JSON.stringify(options.pkce));
  }
  const cleaned=[];
  player.c.history.replaceState=(_a,_b,value)=>{cleaned.push(value);player.c.location.href=new URL(value,player.c.location.origin).href;};
  const reports=[];player.api.onDiagnostic(d=>reports.push(d));
  const app=appFixture({context:player.c,realSession:true});
  return {...app,player,cleaned,reports};
}
function assertLoggedOut(f) {
  assert.equal(f.element("login-screen").hidden,false);
  assert.equal(f.element("login-btn").disabled,false);
  assert.equal(f.element("scan-btn").disabled,true);
  assert.equal(f.element("game-screen").hidden,true);
  assert.equal(f.player.api.isReady(),false);
  assert.equal(f.c.localStorage.getItem("bamboc.spotify.tokens"),null);
}
test("session: first visit without tokens shows working LOGIN and cannot scan or initialize SDK", async()=>{
  const f=sessionFixture({tokens:{}});await flush();assertLoggedOut(f);
  f.click("scan-btn");f.click("reset-btn");await flush();
  assert.equal(f.calls.includes("scan"),false);assert.equal(f.player.instances.length,0);
  await f.click("login-btn");
  assert.equal(new URL(f.c.location.assigned).hostname,"accounts.spotify.com");
  assert.ok(f.c.sessionStorage.getItem("bamboc.spotify.pkce"));
});
test("session: expired token refreshes before player init and valid reload reaches READY", async()=>{
  let calls=0;
  const f=sessionFixture({tokens:expired,fetcher:async()=>{calls++;return response(200,{access_token:"fresh",expires_in:3600});}});
  await flush();assert.equal(calls,1);assert.equal(f.player.api.isReady(),true);assert.equal(f.element("scan-btn").disabled,false);
  const reload=sessionFixture({tokens:{"bamboc.spotify.tokens":f.c.localStorage.getItem("bamboc.spotify.tokens")}});
  await flush();assert.equal(reload.element("scan-btn").disabled,false);
  f.pagehide();reload.pagehide();
});
test("session: every refresh failure returns to LOGIN, clears only owned keys, no SDK", async()=>{
  for(const status of [400,401,503]) {
    const f=sessionFixture({tokens:{...expired,unrelated:"keep"},fetcher:async()=>response(status)});
    await flush();assertLoggedOut(f);assert.equal(f.player.instances.length,0);
    assert.equal(f.c.localStorage.getItem("unrelated"),"keep");
    f.click("connect-btn");f.click("reset-btn");await flush();assert.equal(f.player.requests.length,0);
  }
});
test("session: corrupt and partial storage cannot grant login, including bogus expiry", async()=>{
  for(const value of ['{broken','null','42','[]',JSON.stringify({accessToken:"a"}),
    JSON.stringify({accessToken:"a",expiresAt:Date.now()+3600000}),
    JSON.stringify({accessToken:{},refreshToken:"r",expiresAt:Date.now()+3600000}),
    JSON.stringify({accessToken:"a",refreshToken:"r",expiresAt:"9999999999999"}),
    JSON.stringify({accessToken:"a",refreshToken:"r",expiresAt:1e100})]) {
    const f=sessionFixture({tokens:{"bamboc.spotify.tokens":value}});await flush();assertLoggedOut(f);
    assert.equal(f.player.instances.length,0);
  }
});
test("session: valid OAuth callback cleans URL then connects; SCAN requires READY", async()=>{
  const f=sessionFixture({tokens:{},noReady:true,callback:"https://test.example/game/?code=c&state=s&debug=1#top",
    pkce:{verifier:"v",state:"s",createdAt:Date.now()},fetcher:async()=>response(200,{access_token:"a",refresh_token:"r",expires_in:3600})});
  await flush();assert.equal(f.element("scan-btn").disabled,true);assert.equal(f.player.instances.length,1);
  assert.equal(f.element("status").attributes["data-spotify-state"],"PLAYER_CONNECTING");
  assert.deepEqual(f.cleaned,["/game/?debug=1#top"]);
  f.click("scan-btn");await flush();assert.equal(f.calls.includes("scan"),false);
  f.player.instance.emit("ready",{device_id:f.player.instance.device});await flush();
  assert.equal(f.element("scan-btn").disabled,false);f.pagehide();
});
test("session: invalid/incomplete OAuth callback clears old tokens, cleans URL and allows new login", async()=>{
  for(const query of ["code=c&state=wrong","state=s","code=&state=s","error=access_denied&state=s"]) {
    const f=sessionFixture({callback:"https://test.example/game/?"+query,pkce:{verifier:"v",state:"s",createdAt:Date.now()}});
    await flush();assertLoggedOut(f);assert.equal(f.player.instances.length,0);
    assert.equal(f.c.location.href,"https://test.example/game/");await f.click("login-btn");
    assert.equal(new URL(f.c.location.assigned).hostname,"accounts.spotify.com");
  }
});
test("session: READY without valid device and failed connect never enable SCAN", async()=>{
  for(const options of [{readyDevice:""},{connectFalse:true}]) {
    const f=sessionFixture(options);await flush();
    assert.equal(f.element("scan-btn").disabled,true);assert.equal(f.player.api.isReady(),false);
    assert.equal(f.element("connect-btn").hidden,false);f.click("scan-btn");await flush();
    assert.equal(f.calls.includes("scan"),false);f.pagehide();
  }
});
test("session: READY event alone is insufficient until connect promise succeeds", async()=>{
  const gate=defer(),f=sessionFixture({connectGate:gate.promise});await flush();
  assert.equal(f.element("scan-btn").disabled,true);assert.equal(f.player.api.isReady(),false);
  gate.resolve(true);await flush();assert.equal(f.element("scan-btn").disabled,false);f.pagehide();
});
test("session: readiness timeout offers connection retry, never playback retry", async()=>{
  const f=sessionFixture({noReady:true});await delay(100);
  assert.equal(f.element("scan-btn").disabled,true);assert.equal(f.element("connect-btn").hidden,false);
  assert.equal(f.element("status").attributes["data-error-code"],"PLAYER_NOT_READY");
  f.player.options.noReady=false;await f.click("connect-btn");await flush();
  assert.equal(f.element("scan-btn").disabled,false);assert.equal(f.player.requests.length,0);f.pagehide();
});
test("session: SDK authentication failure before any round returns to LOGIN", async()=>{
  const f=sessionFixture({authError:true});await flush();assertLoggedOut(f);
  assert.ok(f.player.instances.every(instance=>instance.disconnected));
});
test("session: auth lost during PREPARING aborts round; retry cannot start playback", async()=>{
  const gate=defer(),f=sessionFixture({apiGate:gate.promise});await flush();f.click("scan-btn");await flush();
  const scan=f.scan("spotify:track:"+id);await delay(5);
  const request=f.player.requests[0];assert.ok(request);
  f.player.instance.emit("authentication_error",{});
  await scan;assertLoggedOut(f);assert.equal(request.signal.aborted,true);assert.equal(f.element("timer").hidden,true);
  const count=f.player.requests.length;f.click("reset-btn");f.click("connect-btn");await flush();
  assert.equal(f.player.requests.length,count);gate.resolve();await flush();assert.equal(f.player.audio.length,0);
});
test("session: auth lost during PLAYING cancels UI/timer/player/camera", async()=>{
  const f=sessionFixture();await flush();f.click("scan-btn");await flush();
  await f.scan("spotify:track:"+id);assert.equal(f.element("timer").hidden,false);
  const old=f.player.instance;old.emit("authentication_error",{});await flush();assertLoggedOut(f);
  assert.equal(old.disconnected,true);assert.equal(f.element("timer").hidden,true);
  assert.equal(f.element("result").hidden,true);assert.ok(f.calls.includes("camera stop"));
});
test("session: repeated playback 401 refreshes once then resets to LOGIN", async()=>{
  let tokenCalls=0,apiCalls=0;
  const f=sessionFixture({fetcher:async url=>{
    if(url.includes("/api/token")){tokenCalls++;return response(200,{access_token:"fresh",expires_in:3600});}
    apiCalls++;return response(401);
  }});await flush();
  f.click("scan-btn");await flush();await f.scan("spotify:track:"+id);
  await flush();assertLoggedOut(f);assert.equal(tokenCalls,1);assert.equal(apiCalls,2);
});
test("session: logout invalidates device and old callbacks cannot revive it during fresh login", async()=>{
  const f=sessionFixture();await flush();const old=f.player.instance;
  f.click("logout-btn");await flush();assertLoggedOut(f);
  old.emit("ready",{device_id:old.device});old.emit("authentication_error",{});await flush();assertLoggedOut(f);
  await f.click("login-btn");const transaction=f.c.sessionStorage.getItem("bamboc.spotify.pkce");
  old.emit("not_ready",{});old.emit("authentication_error",{});await flush();
  assert.equal(f.c.sessionStorage.getItem("bamboc.spotify.pkce"),transaction);
  assert.equal(f.player.api.isReady(),false);
});
test("session: not_ready while idle blocks scan and reconnection does not start a song", async()=>{
  const f=sessionFixture();await flush();f.player.instance.emit("not_ready",{});await flush();
  assert.equal(f.element("scan-btn").disabled,true);assert.equal(f.element("connect-btn").hidden,false);
  f.click("scan-btn");assert.equal(f.calls.includes("scan"),false);
  f.click("connect-btn");await flush();assert.equal(f.element("scan-btn").disabled,false);
  assert.equal(f.player.requests.length,0);f.pagehide();
});
test("production OAuth redirect remains HTTPS Pages with exact trailing slash and no callback query", async()=>{
  const c=environment({location:{hostname:"fbellini22.github.io",origin:"https://fbellini22.github.io",
    pathname:"/bamboc-hit/index.html",search:"?code=old&state=old",href:"https://fbellini22.github.io/bamboc-hit/index.html?code=old&state=old",
    assign(value){this.assigned=value;}}});
  load(c,"spotify-auth.js");await c.Bamboc.auth.login();
  assert.equal(c.Bamboc.config.redirectUri,"https://fbellini22.github.io/bamboc-hit/");
  assert.equal(new URL(c.location.assigned).searchParams.get("redirect_uri"),c.Bamboc.config.redirectUri);
});
test("session: network refresh failure and malformed token response require LOGIN", async()=>{
  for(const fetcher of [async()=>{throw new TypeError("offline");},async()=>response(200,{access_token:"bad",expires_in:"3600"})]) {
    const f=sessionFixture({tokens:expired,fetcher});await flush();assertLoggedOut(f);assert.equal(f.player.instances.length,0);
  }
});

test("session: missing PKCE verifier rejects callback even with valid saved tokens", async()=>{
  const f=sessionFixture({callback:"https://test.example/game/?code=c&state=s"});await flush();
  assertLoggedOut(f);assert.equal(f.player.instances.length,0);assert.equal(f.c.location.href,"https://test.example/game/");
});
test("session: SDK token renewal failure during PLAYING logs out without delivering an invalid token", async()=>{
  const f=sessionFixture();await flush();f.click("scan-btn");await flush();await f.scan("spotify:track:"+id);
  f.c.Date=class extends Date {static now(){return Date.now()+7200000;}};
  f.c.fetch=async()=>response(503);let delivered=false;
  f.player.instance.oauthToken(()=>{delivered=true;});await flush();assertLoggedOut(f);
  assert.equal(delivered,false);assert.equal(f.element("timer").hidden,true);
});
test("session: token expiry before SCAN refreshes connection without opening camera", async()=>{
  const f=sessionFixture();await flush();f.c.Date=class extends Date {static now(){return Date.now()+7200000;}};
  let refreshes=0;f.c.fetch=async()=>{refreshes++;return response(200,{access_token:"fresh",expires_in:3600});};
  await f.click("scan-btn");await flush();
  assert.equal(refreshes,1);assert.equal(f.element("scan-btn").disabled,false);assert.equal(f.calls.includes("scan"),false);
  f.click("scan-btn");await flush();assert.equal(f.calls.includes("scan"),true);f.pagehide();
});
test("session: token expiry while scanning recovers refresh before another scan, no round", async()=>{
  const f=sessionFixture();await flush();f.click("scan-btn");await flush();
  f.c.Date=class extends Date {static now(){return Date.now()+7200000;}};
  f.c.fetch=async()=>response(200,{access_token:"fresh",expires_in:3600});
  await f.scan("spotify:track:"+id);await flush();
  assert.equal(f.element("scan-btn").disabled,false);assert.equal(f.player.requests.length,0);f.pagehide();
});
test("session: logout during connect discards late READY/connect success", async()=>{
  const gate=defer(),f=sessionFixture({connectGate:gate.promise});await flush();const old=f.player.instance;
  f.click("logout-btn");gate.resolve(true);old.emit("ready",{device_id:old.device});await flush();assertLoggedOut(f);
  assert.equal(old.disconnected,true);
});
test("session: logout during refresh cannot erase a new PKCE transaction on late rejection", async()=>{
  const gate=defer(),f=sessionFixture({tokens:expired,fetcher:()=>gate.promise});await flush();
  f.click("logout-btn");await flush();assertLoggedOut(f);await f.click("login-btn");
  const pkce=f.c.sessionStorage.getItem("bamboc.spotify.pkce");gate.resolve(response(401));await flush();
  assert.equal(f.c.sessionStorage.getItem("bamboc.spotify.pkce"),pkce);
  assert.equal(f.element("status").attributes["data-spotify-state"],"AUTHENTICATING");
  f.pagehide();
});
test("session: classified network playback failure offers connection recovery without clearing valid tokens", async()=>{
  const f=sessionFixture();await flush();f.c.fetch=async()=>{throw new TypeError("offline");};
  f.click("scan-btn");await flush();await f.scan("spotify:track:"+id);
  assert.equal(f.element("status").attributes["data-error-code"],"NETWORK_ERROR");
  assert.equal(f.element("scan-btn").disabled,true);assert.equal(f.element("connect-btn").hidden,false);
  assert.ok(f.c.localStorage.getItem("bamboc.spotify.tokens"));f.pagehide();
});

test("session: late audio activation cannot clear a newer login transaction", async()=>{
  const f=sessionFixture();await flush();const gate=defer();
  f.c.Bamboc.playback.activate=()=>gate.promise;f.click("scan-btn");await flush();
  f.click("logout-btn");await f.click("login-btn");
  const pkce=f.c.sessionStorage.getItem("bamboc.spotify.pkce");gate.resolve();await flush();
  assert.equal(f.c.sessionStorage.getItem("bamboc.spotify.pkce"),pkce);
  assert.equal(f.element("status").attributes["data-spotify-state"],"AUTHENTICATING");
  assert.equal(f.calls.includes("scan"),false);f.pagehide();
});
test("session: late round stop cannot close the camera of a newer session", async()=>{
  const f=sessionFixture();await flush();f.click("scan-btn");await flush();await f.scan("spotify:track:"+id);
  const gate=defer(),old=f.player.instance;old.pause=()=>gate.promise;f.click("reveal-btn");await flush();
  f.click("logout-btn");await flush();const stops=f.calls.filter(call=>call==="camera stop").length;
  old.state={...old.state,paused:true};gate.resolve();await delay(5);
  assert.equal(f.calls.filter(call=>call==="camera stop").length,stops);assertLoggedOut(f);
});

test("OAuth diagnostic: full reload preserves verifier/state and identical production redirect URIs", async()=>{
  const logs=[], shared=storage();
  const location={hostname:"fbellini22.github.io",origin:"https://fbellini22.github.io",pathname:"/bamboc-hit/index.html",
    search:"?debug=1",href:"https://fbellini22.github.io/bamboc-hit/index.html?debug=1#top",assign(value){this.assigned=value;}};
  const a=environment({location,sessionStorage:shared});a.console.debug=(...args)=>logs.push(args);load(a,"spotify-auth.js");
  await a.Bamboc.auth.login();
  const authorize=new URL(a.location.assigned),pkce=JSON.parse(shared.getItem("bamboc.spotify.pkce"));
  const b=environment({sessionStorage:shared,location:{...location,pathname:"/bamboc-hit/",search:"?code=SECRET_CODE&state="+pkce.state,
    href:"https://fbellini22.github.io/bamboc-hit/?code=SECRET_CODE&state="+pkce.state},
    fetch:async(_url,request)=>{
      assert.equal(request.body.get("redirect_uri"),authorize.searchParams.get("redirect_uri"));
      assert.equal(request.body.get("redirect_uri"),"https://fbellini22.github.io/bamboc-hit/");
      assert.equal(request.body.get("code_verifier"),pkce.verifier);
      assert.equal(request.body.get("client_id"),"1031669a52cf4742b6e908a536a247e5");
      return response(200,{access_token:"SECRET_ACCESS",refresh_token:"SECRET_REFRESH",expires_in:3600});
    }});
  b.location.search += "&debug=1";load(b,"config.js");
  b.console.debug=(...args)=>logs.push(args);load(b,"spotify-auth.js");await b.Bamboc.auth.handleRedirect();await b.Bamboc.auth.getToken();
  assert.deepEqual(logs.map(x=>x[0]),["login_start","pkce_created","redirect_start","callback_detected","state_valid","verifier_found",
    "token_exchange_start","token_exchange_success","token_valid"].map(x=>"[BAMBOC AUTH] "+x));
  const serialized=JSON.stringify(logs);
  for(const secret of [pkce.verifier,pkce.state,"SECRET_CODE","SECRET_ACCESS","SECRET_REFRESH"]) assert.equal(serialized.includes(secret),false);
});
test("OAuth diagnostic: callback completes before recovery/SDK; reset cannot clear PKCE before consumption", async()=>{
  const gate=defer(),order=[];
  const f=sessionFixture({tokens:expired,callback:"https://test.example/game/?code=c&state=s",
    pkce:{verifier:"survives",state:"s",createdAt:Date.now()},fetcher:async(_url,request)=>{
      order.push(request.body.get("grant_type"));assert.equal(request.body.get("code_verifier"),"survives");return gate.promise;
    }});
  await flush();assert.deepEqual(order,["authorization_code"]);assert.equal(f.player.instances.length,0);
  assert.equal(f.element("scan-btn").disabled,true);
  gate.resolve(response(200,{access_token:"new",refresh_token:"new-r",expires_in:3600}));await flush();
  assert.deepEqual(order,["authorization_code"]);assert.equal(f.element("scan-btn").disabled,false);
});
test("OAuth diagnostic: missing verifier and state mismatch retain distinct causes", async()=>{
  for(const [pkce,type] of [[null,"PKCE_VERIFIER_MISSING"],[{verifier:"v",state:"wrong",createdAt:Date.now()},"OAUTH_STATE_MISMATCH"]]) {
    const c=authFixture({},async()=>{throw new Error("must not fetch");});c.location.href="https://test.example/game/?code=c&state=s";
    if(pkce)c.sessionStorage.setItem("bamboc.spotify.pkce",JSON.stringify(pkce));
    await assert.rejects(c.Bamboc.auth.handleRedirect(),e=>e.diagnosticCode===type&&e.phase==="callback_validation");
  }
});
test("OAuth diagnostic: token exchange HTTP/network/invalid response retains phase and status", async()=>{
  for(const [fetcher,type,status] of [
    [async()=>response(400),"TOKEN_EXCHANGE_400",400],[async()=>response(401),"TOKEN_EXCHANGE_401",401],
    [async()=>{throw new Error("sensitive network text");},"TOKEN_EXCHANGE_NETWORK",undefined],
    [async()=>response(200,{}),"TOKEN_RESPONSE_INVALID",200]]) {
    const c=authFixture({},fetcher);c.location.href="https://test.example/game/?code=c&state=s";
    c.sessionStorage.setItem("bamboc.spotify.pkce",JSON.stringify({verifier:"v",state:"s",createdAt:Date.now()}));
    await assert.rejects(c.Bamboc.auth.handleRedirect(),e=>e.diagnosticCode===type&&e.phase==="token_exchange"&&e.status===status);
  }
});
test("OAuth diagnostic: SDK errors preserve SDK phase; account error never requires login", async()=>{
  for(const type of ["authentication_error","account_error","initialization_error"]) {
    const f=playerFixture({noReady:true});const errors=[];f.api.onError(e=>errors.push(e));
    const pending=f.api.prepare();await delay(0);f.instance.emit(type,{message:"SECRET_SDK_MESSAGE"});
    await assert.rejects(pending,e=>e.diagnosticCode==="SDK_"+type.toUpperCase()&&e.phase==="sdk_event");
    assert.equal(errors[0].code,type==="authentication_error"?"AUTH_REQUIRED":"PLAYER_NOT_READY");
    if(type==="account_error")assert.match(errors[0].message,/Premium/);
  }
});
test("OAuth diagnostic: SCAN impossible for callback/exchange/SDK failures before READY", async()=>{
  for(const options of [
    {tokens:{},callback:"https://test.example/game/?code=c&state=s"},
    {tokens:{},callback:"https://test.example/game/?code=c&state=s",pkce:{verifier:"v",state:"bad",createdAt:Date.now()}},
    ...[400,401].map(status=>({tokens:{},callback:"https://test.example/game/?code=c&state=s",
      pkce:{verifier:"v",state:"s",createdAt:Date.now()},fetcher:async()=>response(status)})),
    {connectFalse:true},{readyDevice:""},{authError:true}]) {
    const f=sessionFixture(options);await flush();assert.equal(f.element("scan-btn").disabled,true);
    f.click("scan-btn");await flush();assert.equal(f.calls.includes("camera start"),false);
  }
  for(const type of ["account_error","initialization_error"]){
    const f=sessionFixture({noReady:true});await flush();f.player.instance.emit(type,{});await flush();
    assert.equal(f.element("scan-btn").disabled,true);assert.equal(f.element("login-screen").hidden,true);
  }
});
test("OAuth diagnostic: connection failure, ready timeout and missing device have distinct types", async()=>{
  for(const [options,type] of [[{connectFalse:true},"PLAYER_CONNECT_FAILED"],[{noReady:true},"PLAYER_READY_TIMEOUT"],[{readyDevice:""},"DEVICE_MISSING"]]){
    const f=playerFixture(options);await assert.rejects(f.api.prepare(),e=>e.diagnosticCode===type);
  }
});
test("console debug requires URL opt-in; old persisted debug flag cannot enable it", ()=>{
  const shared=storage({"bamboc.spotify.diagnostics":"1"}),logs=[];
  for(const search of ["?debug=1","","?debug=0",""]){
    const c=environment({sessionStorage:shared,location:{search,hostname:"test",origin:"https://test",pathname:"/"}});
    c.console.debug=(...args)=>logs.push(args);c.Bamboc.diagnostics("AUTH","probe");
  }
  assert.equal(logs.length,1);
});

test("OAuth diagnostic: player logs only safe readiness facts, never device/token/SDK message", async()=>{
  const f=playerFixture(),logs=[];f.c.location.search="?debug=1";load(f.c,"config.js");
  f.c.console.debug=(...args)=>logs.push(args);
  f.c.console.warn=(...args)=>logs.push(args);
  await f.api.prepare();f.instance.oauthToken(()=>{});await delay(0);
  f.instance.emit("account_error",{message:"SECRET_SDK_MESSAGE"});
  const text=JSON.stringify(logs);
  for(const event of ["sdk_loaded","connect_start","connect_result","ready","device_id_present","get_oauth_token"])
    assert.ok(logs.some(x=>x[0]==="[BAMBOC PLAYER] "+event));
  assert.equal(text.includes("SECRET_SDK_MESSAGE"),false);assert.equal(text.includes(f.instance.device),false);
  assert.ok(logs.some(x=>x[1].type==="SDK_ACCOUNT_ERROR"));
});
test("OAuth diagnostic: PKCE storage failure is explicit and cannot redirect", async()=>{
  const c=authFixture({},async()=>response(200));c.sessionStorage.setItem=()=>{throw new Error("denied");};
  await assert.rejects(c.Bamboc.auth.login(),e=>e.diagnosticCode==="PKCE_STORAGE_FAILED");
  assert.equal(c.location.assigned,undefined);
});

test("local duration: countdown 3-2-1 precedes first direct play and PLAYING needs progression", async()=>{
 const f=playerFixture({physicalMuteUnsupported:true}),clock=fakeClock(),ticks=[],events=[];
 f.c.Bamboc.diagnostics=(_a,event,details)=>events.push({event,...details});
 const gate=core.preplayCountdown(3000,n=>ticks.push(n),{now:clock.now,schedule:clock.schedule,unschedule:clock.unschedule});
 const pending=f.api.play(song,()=>{},{roundId:42,readyToStart:gate});
 await delay(10);assert.equal(f.requests.length,0);assert.equal(f.audio.length,0);
 await clock.advance(1000);assert.equal(f.requests.length,0);await clock.advance(1000);assert.equal(f.requests.length,0);
 await clock.advance(1000);await pending;assert.deepEqual(ticks,[3,2,1,0]);assert.equal(f.requests.length,1);
 assert.ok(f.requests[0].body.position_ms>=1000);assert.equal(f.calls.includes("pause"),false);assert.equal(f.calls.includes("seek"),false);
 assert.ok(events.some(x=>x.event==="confirmation_success"));assert.ok(events.some(x=>x.phase==="playing_confirmed"));await f.api.stop();
});
test("direct playback diagnostics distinguish missing duration, wrong track, mismatch and stalled position", async()=>{
 for(const [options,track,expected] of [[{}, {...song,durationMs:undefined},"validate_local_duration"],
 [{wrongTrack:true},song,"confirm_direct_playback"],[{duration:1000},song,"confirm_direct_playback"],
 [{stalled:true},song,"confirm_position_progression"]]){
 const f=playerFixture(options),reports=[];f.api.onDiagnostic(d=>reports.push(d));await assert.rejects(f.api.play(track,()=>{},{roundId:71}));
 const d=reports.at(-1);assert.equal(d.phase,expected);assert.equal(d.roundId,71);assert.equal(d.trackId,id);
 if(options.stalled){assert.equal(d.failure.confirmationTimeout,true);assert.ok(d.timeline.some(x=>x.event==="confirmation_timeout"));}
 }
});
test("mobile diagnostic: direct play HTTP failure retains status, with no transfer command", async()=>{
 const f=playerFixture({realAuth:true,tokens:savedSession(),fetcher:async()=>response(403)}),reports=[];
 f.api.onDiagnostic(d=>reports.push(d));await assert.rejects(f.api.play(song));
 const d=reports.at(-1);assert.equal(d.failure.httpStatus,403);assert.equal(d.phase,"play_command");
 assert.equal(d.transfer.result,"not_required_direct_device");assert.equal(d.playbackCommands[0].httpStatus,403);
 assert.ok(d.playbackCommands[0].positionMs>=1000);
});
test("SDK authentication reset preserves error evidence and safely logs out", async()=>{
  const gate=defer(),f=sessionFixture({apiGate:gate.promise});await flush();
  f.click("scan-btn");await flush();const pending=f.scan("spotify:track:"+id);await flush();
  f.player.instance.emit("authentication_error",{message:"SECRET_ACCESS_TOKEN SECRET_VERIFIER"});await pending;
  const d=f.reports.at(-1),text=JSON.stringify(d);
  assert.equal(d.sdkEvent,"authentication_error");assert.equal(d.failure.type,"SDK_AUTHENTICATION_ERROR");
  assert.equal(text.includes("SECRET"),false);assertLoggedOut(f);gate.resolve();
});
test("mobile diagnostic: SDK events during preparation are captured before cleanup", async()=>{
  for(const event of ["playback_error","account_error","initialization_error"]) {
    const gate=defer(),f=playerFixture({apiGate:gate.promise}),reports=[];f.api.onDiagnostic(d=>reports.push(d));
    const pending=f.api.play(song);await delay(5);f.instance.emit(event,{message:"SECRET"});await assert.rejects(pending);
    assert.equal(reports[0].sdkEvent,event);assert.equal(reports[0].failure.type,"SDK_"+event.toUpperCase());gate.resolve();
  }
});
test("local duration missing never uses SDK load-from-zero fallback", async()=>{
 const f=playerFixture(),reports=[];f.api.onDiagnostic(d=>reports.push(d));
 await assert.rejects(f.api.play({...song,durationMs:undefined}));const d=reports.at(-1);
 assert.equal(d.localDurationPresent,false);assert.equal(d.failure.type,"LOCAL_DURATION_MISSING");assert.equal(d.playbackCommands.length,0);
});
test("mobile diagnostic: late play response retains round ID and cannot overwrite newer failure", async()=>{
 const gate=defer(),f=playerFixture({apiGate:gate.promise}),events=[],reports=[],controller=new AbortController();
 f.c.Bamboc.diagnostics=(_a,event,details)=>events.push({event,...details});f.api.onDiagnostic(d=>reports.push(d));
 const pending=f.api.play(song,()=>{},{roundId:81,signal:controller.signal});await delay(10);
 controller.abort(new Error("Round annullato."));await assert.rejects(pending);
 f.options.apiGate=null;f.options.stalled=true;await assert.rejects(f.api.play(song,()=>{},{roundId:82}));
 const count=reports.length;gate.resolve();await delay(5);assert.equal(reports.length,count);assert.equal(reports.at(-1).roundId,82);
 assert.ok(events.some(e=>e.event==="late_round_operation_ignored"&&e.roundId===81&&e.phase==="play_command"));
});

test("mobile diagnostic: arbitrary playback rejection text is never exposed", async()=>{
 const f=playerFixture(),reports=[];f.api.onDiagnostic(d=>reports.push(d));
 f.c.Bamboc.auth.api=()=>Promise.reject(new Error("Timeout access_token=short-secret code=private verifier=secret"));
 await assert.rejects(f.api.play(song));const text=JSON.stringify(reports);
 assert.equal(text.includes("short-secret"),false);assert.equal(text.includes("private"),false);assert.match(reports[0].failure.message,/omesso/);
});
test("mobile diagnostic: interruption after successful playback preserves observed pause", async()=>{
  const f=sessionFixture();await flush();f.click("scan-btn");await flush();await f.scan("spotify:track:"+id);
  f.player.setState({...f.player.instance.state,paused:true});await flush();
  const d=f.reports.at(-1);
  assert.equal(d.phase,"playing_confirmed");assert.equal(d.failure.type,"PLAYBACK_INTERRUPTED");
  assert.equal(d.lastState.paused,true);
});

test("phone regression: ignored physical mute cannot leak preload because there is no preload", async()=>{
 const f=playerFixture({physicalMuteUnsupported:true}),gate=defer();
 const pending=f.api.play(song,()=>{},{readyToStart:gate.promise});await delay(10);
 assert.equal(f.audio.length,0);assert.equal(f.requests.length,0);gate.resolve();await pending;
 assert.ok(f.audio.length>0);assert.ok(f.audio.every(x=>x.position>=1000));
 assert.equal(f.calls.includes("seek"),false);assert.equal(f.calls.includes("resume"),false);await f.api.stop();
});
test("visible countdown contains only 3,2,1 while delayed setup remains pending", async()=>{
  const clock=fakeClock(),gate=defer(),f=appFixture({clock,preplayMs:3000});await flush();
  f.setPlay(gate.promise);f.click("scan-btn");await flush();const pending=f.scan("spotify:track:"+id);await flush();
  const visible=[];
  for(let i=0;i<5;i++){if(!f.element("preplay").hidden)visible.push(f.element("preplay-count").textContent);await clock.advance(1000);}
  assert.deepEqual(visible,["3","2","1"]);assert.equal(f.element("go-label").hidden,true);
  assert.equal(f.element("timer").hidden,true);gate.resolve(null);await pending;
  assert.equal(f.element("go-label").hidden,true);assert.equal(f.element("preplay").hidden,true);
  f.click("reveal-btn");await flush();
});

test("local durations: every dataset entry has exact-ID Spotify verification and unique playable ID", async()=>{
  const c=environment();load(c,"song.js");
  const evidence=JSON.parse(await readFile(new URL("duration-verification.json",root),"utf8"));
  const byId=new Map(evidence.map(row=>[row.id,row]));assert.equal(evidence.length,347);
  assert.equal(byId.size,347);
  assert.equal(c.SONGS.length,347);
  for(const entry of c.SONGS){
    const proof=byId.get(entry.id);assert.equal(proof.status,"verified");assert.equal(proof.httpStatus,200);
    assert.equal(proof.returnedId,entry.id);assert.equal(proof.returnedUri,"spotify:track:"+entry.id);
    assert.equal(proof.source,"https://open.spotify.com/embed/track/"+entry.id);
    assert.equal(entry.durationMs,proof.durationMs);assert.ok(Number.isSafeInteger(entry.durationMs));
  }
  const queen=c.SONGS.find(entry=>entry.title==="Bohemian Rhapsody"&&entry.artist==="Queen");
  const rimmel=c.SONGS.find(entry=>entry.title==="Rimmel"&&entry.artist==="Francesco De Gregori");
  assert.equal(queen.id,"4u7EnebtmKWzUH433cf5Qv");
  assert.equal(rimmel.id,"515XcapFOMtOOiGU31UqNp");assert.notEqual(queen.id,rimmel.id);
  const catalog=core.createCatalog(c.SONGS);
  assert.equal(catalog.isConflict(queen.id),false);assert.equal(catalog.isConflict(rimmel.id),false);
  assert.equal(catalog.lookup(queen.id).title,queen.title);
  assert.equal(catalog.lookup(rimmel.id).title,rimmel.title);assert.equal(catalog.size,347);
});
test("local duration: offset precedes first play and runtime never requests metadata or transport preparation", async()=>{
  const f=playerFixture(),events=[];f.c.Bamboc.diagnostics=(_a,event,d)=>events.push({event,...d});
  await f.api.play(song);
  assert.equal(f.requests.length,1);assert.ok(f.requests[0].path.includes("device_id="));
  assert.deepEqual(f.requests[0].body.uris,["spotify:track:"+id]);assert.ok(f.requests[0].body.position_ms>=1000);
  assert.ok(events.findIndex(x=>x.event==="random_position_calculated")<events.findIndex(x=>x.phase==="play_command"));
  assert.equal(f.calls.some(x=>/tracks|seek|resume|pause|volume:/.test(x)),false);
  assert.equal(f.calls.includes("/me/player"),false);await f.api.stop();
});
test("local duration: absent/invalid/too-short values never produce any play command", async()=>{
  for(const durationMs of [undefined,null,0,-1,NaN,Infinity,"180000",180000.5,47000]) {
    const f=playerFixture();await assert.rejects(f.api.play({...song,durationMs}));assert.equal(f.requests.length,0);
  }
});
test("local duration: not-ready player cannot start after countdown completion", async()=>{
  const f=playerFixture({noReady:true}),reports=[];f.api.onDiagnostic(d=>reports.push(d));
  await assert.rejects(f.api.play(song,()=>{},{readyToStart:Promise.resolve()}));
  assert.equal(f.requests.length,0);assert.equal(f.audio.length,0);assert.equal(reports.at(-1).failure.type,"PLAYER_READY_TIMEOUT");
});
test("confirmation lifecycle: success, ordinary failure and timeout remain separate", async()=>{
  const f=playerFixture(),events=[];f.c.Bamboc.diagnostics=(_a,event)=>events.push(event);
  await f.api.play(song);assert.equal(events.filter(x=>x==="confirmation_success").length,2);
  assert.equal(events.filter(x=>x==="confirmation_started").length,2);await f.api.stop();
  for(const [options,expected] of [[{stalled:true},"confirmation_timeout"],[{duration:1000},"confirmation_failed"]]){
    const g=playerFixture(options),reports=[];g.api.onDiagnostic(d=>reports.push(d));await assert.rejects(g.api.play(song));
    const timeline=reports.at(-1).timeline;assert.ok(timeline.some(x=>x.event==="confirmation_started"));
    assert.ok(timeline.some(x=>x.event===expected));assert.equal(timeline.some(x=>x.phase==="playing_confirmed"),false);
  }
});
test("confirmation tolerates real elapsed playback instead of a fixed start window", async()=>{
  const f=playerFixture();let now=Date.now();f.c.Date=class extends Date {static now(){return now;}};
  const original=f.c.Bamboc.auth.api;
  f.c.Bamboc.auth.api=async(path,options)=>{await original(path,options);if(path.startsWith("/me/player/play")){
    now+=5000;f.instance.state.position+=5000;
  }};
  await f.api.play(song);assert.equal(f.instance.disconnected,false);await f.api.stop();
});
test("UI never declares PLAYING from HTTP success without measured position progression", async()=>{
  const f=sessionFixture({stalled:true});await flush();f.click("scan-btn");await flush();await f.scan("spotify:track:"+id);
  assert.equal(f.element("timer").hidden,true);assert.equal(f.element("reveal-btn").disabled,true);
  const report=f.reports.at(-1);
  assert.equal(report.playbackCommands[0].result,"success");assert.equal(report.failure.confirmationTimeout,true);
});

test("real app/player: QR countdown then one direct start; reveal keeps editorial metadata", async()=>{
  const clock=fakeClock(),player=playerFixture({realAuth:true,tokens:savedSession(),physicalMuteUnsupported:true});
  const f=appFixture({clock,context:player.c,realSession:true,preplayMs:3000});await flush();
  f.click("scan-btn");await flush();const pending=f.scan("spotify:track:"+id);await flush();
  const visible=[];
  for(const digit of ["3","2","1"]){visible.push(f.element("preplay-count").textContent);
    assert.equal(f.element("preplay-count").textContent,digit);assert.equal(player.requests.length,0);
    assert.equal(player.audio.length,0);await clock.advance(1000);}
  await pending;assert.deepEqual(visible,["3","2","1"]);assert.equal(player.requests.length,1);
  assert.ok(player.requests[0].body.position_ms>=1000);assert.equal(f.element("timer").hidden,false);
  assert.equal(f.element("go-label").hidden,true);f.click("reveal-btn");await flush();
  const back=f.element("result").children[0].children[1];
  assert.deepEqual(back.children.map(x=>x.textContent),[song.title,song.artist,song.year]);
});
test("SDK failure while confirming publishes confirmation_failed in the phone panel snapshot", async()=>{
  const f=playerFixture({silent:true}),reports=[];f.api.onDiagnostic(d=>reports.push(d));
  const pending=f.api.play(song);await delay(5);f.instance.emit("playback_error",{});await assert.rejects(pending);
  const events=reports.at(-1).timeline.map(x=>x.event);
  assert.ok(events.includes("confirmation_started"));assert.ok(events.includes("confirmation_failed"));
  assert.equal(events.includes("confirmation_success"),false);
});

test("countdown writes each digit once, hides while HTTP is pending, timer waits for confirmed playback", async()=>{
  const gate=defer(),clock=fakeClock(),player=playerFixture({realAuth:true,tokens:savedSession(),apiGate:gate.promise});
  const f=appFixture({clock,context:player.c,realSession:true,preplayMs:3000});await flush();
  const writes=[];let value="";
  Object.defineProperty(f.element("preplay-count"),"textContent",{get:()=>value,set:text=>{value=text;writes.push(text);}});
  f.click("scan-btn");await flush();const pending=f.scan("spotify:track:"+id);await flush();
  for(const digit of ["3","2","1"]){assert.equal(value,digit);assert.equal(f.element("preplay").hidden,false);
    assert.equal(player.requests.length,0);assert.equal(f.element("timer").hidden,true);await clock.advance(1000);}
  assert.deepEqual(writes,["3","2","1"]);assert.equal(f.element("preplay").hidden,true);
  assert.equal(player.requests.length,1);assert.ok(player.requests[0].body.position_ms>=1000);
  const position=player.requests[0].body.position_ms;
  await clock.advance(1000);assert.deepEqual(writes,["3","2","1"]);
  assert.equal(f.element("preplay").hidden,true);assert.equal(f.element("timer").hidden,true);
  assert.equal(f.element("countdown").textContent,"");assert.equal(f.element("reveal-btn").disabled,true);
  gate.resolve();await pending;assert.equal(f.element("timer").hidden,false);assert.equal(f.element("countdown").textContent,"45");
  assert.deepEqual(writes,["3","2","1"]);assert.equal(player.requests[0].body.position_ms,position);
  assert.equal(f.element("preplay").hidden,true);f.click("reveal-btn");await flush();f.click("reset-btn");await flush();
  const next=f.scan("spotify:track:"+id);await flush();assert.equal(value,"3");
  f.click("cancel-btn");await next;await flush();
});
test("countdown ignores duplicate positive ticks and never renders zero as one", async()=>{
  const gate=defer(),f=appFixture({clock:fakeClock()});await flush();f.setPlay(gate.promise);
  f.c.Bamboc.core.preplayCountdown=(_ms,tick)=>{for(const n of [3,3,2,2,1,1,0])tick(n);return Promise.resolve();};
  const values=[];Object.defineProperty(f.element("preplay-count"),"textContent",{set:value=>values.push(value)});
  f.click("scan-btn");await flush();const pending=f.scan("spotify:track:"+id);await flush();
  assert.deepEqual(values,["3","2","1"]);assert.equal(f.element("preplay").hidden,true);
  gate.resolve();await pending;f.click("reveal-btn");await flush();
});
test("browser diagnostics compare actual feature probes with mobile/desktop hints without playback gating", async()=>{
  const android="Mozilla/5.0 (Linux; Android 14) Chrome/130.0.0.0 Mobile Safari/537.36";
  for(const [ua,mobile,mode,result] of [[android,true,"ok","available_for_probe_config"],
    [android,true,"reject","probe_rejected"],[android,true,"absent","EME_API_missing"],
    ["Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0.0.0 Safari/537.36",false,"ok","available_for_probe_config"]]){
    let probes=0;const f=playerFixture();f.c.navigator={userAgent:ua,userAgentData:{mobile,platform:mobile?"Android":"Linux"}};
    f.c.isSecureContext=true;
    if(mode!=="absent")f.c.navigator.requestMediaKeySystemAccess=async(key,configs)=>{
      probes++;assert.equal(key,"com.widevine.alpha");assert.equal(configs[0].sessionTypes[0],"temporary");
      if(mode==="reject"){const e=new Error("PRIVATE_DETAILS");e.name="NotSupportedError";throw e;}return {};
    };
    await f.api.prepare();assert.equal(probes,0);await f.c.Bamboc.browserDiagnostics.probe();
    const report=f.c.Bamboc.browserDiagnostics.snapshot();assert.equal(report.environment.mobile,mobile);
    assert.equal(report.environment.emeAvailable,mode!=="absent");assert.equal(report.keySystem.result,result);
    assert.equal(probes,mode==="absent"?0:1);assert.equal(f.requests.length,0);assert.equal(f.api.isReady(),true);
    f.api.disconnect();
  }
});
test("browser diagnostics expose connect failure before READY without needing a round", async()=>{
  const f=sessionFixture({connectFalse:true});await flush();
  const d=f.c.Bamboc.browserDiagnostics.snapshot();
  assert.equal(d.connectResult,false);assert.ok(d.events.some(e=>e.type==="PLAYER_CONNECT_FAILED"));
  assert.equal(f.element("scan-btn").disabled,true);assert.equal(f.player.requests.length,0);
});
test("activateElement remains synchronous in SCAN gesture; diagnostics preserve activation results", async()=>{
  const gate=defer(),f=sessionFixture();await flush();
  f.c.navigator.userActivation={isActive:true,hasBeenActive:true};let called=false;
  f.player.instance.activateElement=()=>{called=true;assert.equal(f.c.navigator.userActivation.isActive,true);return gate.promise;};
  f.click("scan-btn");assert.equal(called,true);assert.equal(f.calls.includes("scan"),false);
  f.c.navigator.userActivation.isActive=false;gate.resolve();await flush();
  const d=f.c.Bamboc.browserDiagnostics.snapshot();assert.equal(d.activateElement,"success");
  assert.equal(d.events.find(e=>e.event==="activate_called").environment.userActivationActive,true);
  assert.ok(d.events.some(e=>e.event==="camera_started"));f.pagehide();
});
test("browser diagnostics record activation rejection and SDK errors without raw messages or device IDs", async()=>{
  const f=playerFixture();await f.api.prepare();
  f.c.navigator={userAgent:"Chrome/130.0 SECRET_UA",userAgentData:{mobile:true,platform:"SECRET_PLATFORM"}};
  f.instance.activateElement=()=>Promise.reject(new Error("SECRET_TOKEN"));await assert.rejects(f.api.activate());
  for(const event of ["authentication_error","account_error","initialization_error","playback_error","autoplay_failed"])
    f.instance.emit(event,{message:"SECRET_MESSAGE"});
  const d=f.c.Bamboc.browserDiagnostics.snapshot();assert.equal(d.activateElement,"failed");
  for(const type of ["SDK_AUTHENTICATION_ERROR","SDK_ACCOUNT_ERROR","SDK_INITIALIZATION_ERROR","SDK_PLAYBACK_ERROR","SDK_AUTOPLAY_FAILED"])
    assert.ok(d.events.some(e=>e.type===type));
  const text=JSON.stringify(d);assert.equal(text.includes("SECRET"),false);assert.equal(text.includes(f.instance.device),false);f.api.disconnect();
});
test("browser diagnostics preserve HTTP errors, visibility and camera feature/permission differences", async()=>{
  const f=sessionFixture({fetcher:async()=>response(403)});await flush();
  f.c.navigator.permissions={query:async()=>({state:"denied"})};
  f.c.document.visibilityState="visible";f.c.document.hasFocus=()=>true;
  f.c.document.permissionsPolicy={allowsFeature:feature=>feature!=="camera"};
  await f.c.Bamboc.browserDiagnostics.probe();
  f.click("scan-btn");await flush();await f.scan("spotify:track:"+id);
  const d=f.c.Bamboc.browserDiagnostics.snapshot();assert.equal(d.cameraPermission,"denied");
  assert.equal(d.environment.policy.camera,false);assert.equal(d.environment.visibility,"visible");
  assert.ok(d.events.some(e=>e.event==="play_http_response"&&e.status===403));
  assert.equal(d.transfer,"not_used_direct_device");
});

const oauthEvents = c => c.Bamboc.oauthDiagnostics.snapshot().events;
test("OAuth mobile: all exact-message branches fail before token exchange with independent facts", async()=>{
  const now=Date.now(), valid={verifier:"SECRET_VERIFIER",state:"SECRET_STATE",createdAt:now};
  for(const [pkce,query,type] of [
    [null,"code=SECRET_CODE&state=SECRET_STATE","PKCE_VERIFIER_MISSING"],
    [{...valid,verifier:""},"code=SECRET_CODE&state=SECRET_STATE","PKCE_VERIFIER_MISSING"],
    [valid,"code=SECRET_CODE&state=wrong","OAUTH_STATE_MISMATCH"],
    [{...valid,state:undefined},"code=SECRET_CODE&state=SECRET_STATE","OAUTH_STATE_MISMATCH"],
    [valid,"code=SECRET_CODE","OAUTH_STATE_MISMATCH"],
    [{...valid,createdAt:now-600001},"code=SECRET_CODE&state=SECRET_STATE","OAUTH_TRANSACTION_EXPIRED"],
    [{...valid,createdAt:now+600000},"code=SECRET_CODE&state=SECRET_STATE","OAUTH_TRANSACTION_EXPIRED"],
    [{...valid,createdAt:null},"code=SECRET_CODE&state=SECRET_STATE","OAUTH_TRANSACTION_EXPIRED"],
    [valid,"state=SECRET_STATE","OAUTH_CALLBACK_INCOMPLETE"],
  ]) {
    let calls=0;const c=authFixture({},async()=>{calls++;return response(200);});
    c.location.href="https://test.example/game/?"+query;
    if(pkce)c.sessionStorage.setItem("bamboc.spotify.pkce",JSON.stringify(pkce));
    await assert.rejects(c.Bamboc.auth.handleRedirect(),e=>e.message==="Login non valido o scaduto. Avvia nuovamente l'accesso."&&e.diagnosticCode===type);
    assert.equal(calls,0);assert.ok(oauthEvents(c).some(e=>e.event==="error"&&e.type===type));
    assert.ok(oauthEvents(c).some(e=>["state_found","state_missing"].includes(e.event)));
    assert.ok(oauthEvents(c).some(e=>["verifier_found","verifier_missing"].includes(e.event)));
    assert.equal(c.Bamboc.oauthDiagnostics.snapshot().failed,true);
    for(const secret of ["SECRET_VERIFIER","SECRET_STATE","SECRET_CODE"])
      assert.equal(JSON.stringify(c.Bamboc.oauthDiagnostics.snapshot()).includes(secret),false);
  }
});
test("OAuth mobile: corrupt and inaccessible PKCE storage distinguish read failure from absent record", async()=>{
  for(const blocked of [false,true]) {
    const c=authFixture({},async()=>{throw Error("unexpected network");});
    c.location.href="https://test.example/game/?code=c&state=s";
    c.sessionStorage.setItem("bamboc.spotify.pkce","invalid JSON");
    if(blocked) {const get=c.sessionStorage.getItem;c.sessionStorage.getItem=k=>{if(k==="bamboc.spotify.pkce")throw Error("blocked");return get(k);};}
    await assert.rejects(c.Bamboc.auth.handleRedirect());
    assert.ok(oauthEvents(c).some(e=>e.event==="pkce_read"&&e.ok===false));
  }
});
test("OAuth mobile: same storage across document reload links attempt, distinct boots and safe success journal", async()=>{
  const a=authFixture({},async()=>{});await a.Bamboc.auth.login();
  const pkce=JSON.parse(a.sessionStorage.getItem("bamboc.spotify.pkce"));
  const b=environment({sessionStorage:a.sessionStorage,fetch:async()=>response(200,{access_token:"SECRET_ACCESS",refresh_token:"SECRET_REFRESH",expires_in:3600})});
  load(b,"spotify-auth.js");b.location.href="https://test.example/game/?code=SECRET_CODE&state="+pkce.state;
  await b.Bamboc.auth.handleRedirect();await b.Bamboc.auth.getToken();
  const d=b.Bamboc.oauthDiagnostics.snapshot();
  assert.equal(d.attemptId,pkce.diagnosticAttemptId);assert.equal(d.recovered,true);
  assert.notEqual(d.bootId,a.Bamboc.oauthDiagnostics.snapshot().bootId);
  for(const event of ["login_start","pkce_created","redirect_start","callback_detected","state_valid","verifier_found","token_exchange_start","token_exchange_success","token_saved","token_valid"])
    assert.ok(d.events.some(e=>e.event===event),event);
  for(const secret of [pkce.state,pkce.verifier,"SECRET_CODE","SECRET_ACCESS","SECRET_REFRESH"])
    assert.equal(b.sessionStorage.getItem("bamboc.oauth.diagnostic.v1").includes(secret),false);
});
test("OAuth mobile: separate empty tab storage cannot recover attempt or verifier; retry can succeed", async()=>{
  const a=authFixture({},async()=>{});await a.Bamboc.auth.login();
  const first=JSON.parse(a.sessionStorage.getItem("bamboc.spotify.pkce"));
  const b=authFixture({},async()=>response(200,{access_token:"a",refresh_token:"r",expires_in:3600}));
  b.location.href="https://test.example/game/?code=c&state="+first.state;
  await assert.rejects(b.Bamboc.auth.handleRedirect(),e=>e.diagnosticCode==="PKCE_VERIFIER_MISSING");
  assert.equal(b.Bamboc.oauthDiagnostics.snapshot().attemptId,null);
  assert.equal(b.Bamboc.oauthDiagnostics.snapshot().recovered,false);
  await b.Bamboc.auth.login();const second=JSON.parse(b.sessionStorage.getItem("bamboc.spotify.pkce"));
  b.location.href="https://test.example/game/?code=second&state="+second.state;
  await b.Bamboc.auth.handleRedirect();assert.equal(b.Bamboc.auth.hasValidToken(),true);
  assert.notEqual(second.diagnosticAttemptId,first.diagnosticAttemptId);
  assert.ok(oauthEvents(b).some(e=>e.type==="PKCE_VERIFIER_MISSING"));
});
test("OAuth mobile: invalid callback remains logged out after reset and reload", async()=>{
  const f=sessionFixture({callback:"https://test.example/game/?code=c&state=s"});await flush();
  assertLoggedOut(f);assert.match(f.element("status").textContent,/Login non valido o scaduto/);
  f.c.Bamboc.auth.clear();assertLoggedOut(f);
  const next=sessionFixture({tokens:{}});await flush();assertLoggedOut(next);
  assert.equal(f.player.instances.length,0);assert.equal(next.player.instances.length,0);
});
test("OAuth mobile: real UI serializes boot callback, ignores double login tap and waits before SDK", async()=>{
  const gate=defer();let requests=0;
  const f=sessionFixture({tokens:expired,callback:"https://test.example/game/?code=c&state=s",
    pkce:{verifier:"v",state:"s",createdAt:Date.now()},fetcher:async()=>{requests++;return gate.promise;}});
  await f.click("login-btn");await f.click("login-btn");await flush();
  assert.equal(requests,1);assert.equal(f.player.instances.length,0);
  assert.equal(oauthEvents(f.c).filter(e=>e.event==="callback_enter").length,1);
  gate.resolve(response(200,{access_token:"a",refresh_token:"r",expires_in:3600}));await flush();
  assert.ok(oauthEvents(f.c).findIndex(e=>e.event==="player_initialization")>oauthEvents(f.c).findIndex(e=>e.event==="token_exchange_success"));
  assert.equal(f.element("scan-btn").disabled,false);f.pagehide();
});
test("OAuth mobile: first-login double tap creates just one PKCE transaction", async()=>{
  const f=sessionFixture({tokens:{}});await flush();
  const first=f.click("login-btn"),second=f.click("login-btn");
  await Promise.all([first,second]);
  assert.equal(oauthEvents(f.c).filter(e=>e.event==="login_start").length,1);
  assert.equal(oauthEvents(f.c).filter(e=>e.event==="pkce_created").length,1);
  assert.ok(f.c.sessionStorage.getItem("bamboc.spotify.pkce"));f.pagehide();
});
test("OAuth mobile: reload during exchange loses callback but produces no generic invalid-login message", async()=>{
  const gate=defer(),a=authFixture({},async()=>gate.promise);
  a.location.href="https://test.example/game/?code=c&state=s";
  a.sessionStorage.setItem("bamboc.spotify.pkce",JSON.stringify({verifier:"v",state:"s",createdAt:Date.now()}));
  a.history.replaceState=(_a,_b,url)=>{a.location.href=new URL(url,a.location.href).href;};
  const pending=a.Bamboc.auth.handleRedirect();
  const b=environment({sessionStorage:a.sessionStorage,localStorage:a.localStorage,location:{...a.location}});
  load(b,"spotify-auth.js");await b.Bamboc.auth.handleRedirect();
  await assert.rejects(b.Bamboc.auth.getToken(),e=>e.message==="Accedi a Spotify per iniziare.");
  assert.ok(oauthEvents(b).some(e=>e.event==="callback_absent"));
  gate.resolve(response(200,{access_token:"a",refresh_token:"r",expires_in:3600}));await pending;
});
test("OAuth mobile: direct duplicate callback is observable while first exchange is pending", async()=>{
  const gate=defer();const c=authFixture({},async()=>gate.promise);
  c.location.href="https://test.example/game/?code=c&state=s";
  c.history.replaceState=(_a,_b,url)=>{c.location.href=new URL(url,c.location.href).href;};
  c.sessionStorage.setItem("bamboc.spotify.pkce",JSON.stringify({verifier:"v",state:"s",createdAt:Date.now()}));
  const first=c.Bamboc.auth.handleRedirect();
  await c.Bamboc.auth.handleRedirect();
  assert.ok(oauthEvents(c).some(e=>e.event==="callback_overlap"));
  assert.ok(oauthEvents(c).some(e=>e.event==="callback_already_consumed"));
  // Documents a latent API race, NOT the normal serialized UI path.
  await assert.rejects(c.Bamboc.auth.getToken());
  gate.resolve(response(200,{access_token:"a",refresh_token:"r",expires_in:3600}));
  await assert.rejects(first,/annullata/);
  assert.equal(c.Bamboc.auth.hasValidToken(),false);
});
test("OAuth mobile: HTTP and network exchange failures retain status and never raw error payload", async()=>{
  for(const status of [400,503,null]) {
    const c=authFixture({},async()=>{if(status)return response(status);throw Error("SECRET_NETWORK");});
    c.location.href="https://test.example/game/?code=c&state=s";
    c.sessionStorage.setItem("bamboc.spotify.pkce",JSON.stringify({verifier:"v",state:"s",createdAt:Date.now()}));
    await assert.rejects(c.Bamboc.auth.handleRedirect());
    const event=oauthEvents(c).find(e=>e.event==="token_exchange_failure");
    assert.equal(event.status,status??undefined);
    assert.equal(JSON.stringify(oauthEvents(c)).includes("SECRET_NETWORK"),false);
  }
});
test("OAuth mobile: refresh success and failure are visible and concurrent refresh remains deduplicated", async()=>{
  for(const status of [200,400]) {
    let requests=0;const c=authFixture(expired,async()=>{requests++;return response(status,{access_token:"a",expires_in:3600});});
    await Promise.allSettled([c.Bamboc.auth.getToken(),c.Bamboc.auth.getToken()]);
    assert.equal(requests,1);assert.ok(oauthEvents(c).some(e=>e.event==="refresh_start"));
    assert.ok(oauthEvents(c).some(e=>e.event===(status===200?"refresh_success":"refresh_failure")&&e.status===status));
  }
});
test("OAuth mobile: lifecycle journal records persisted navigation without clearing PKCE", async()=>{
  const listeners={};const c=environment({addEventListener:(name,fn)=>{listeners[name]=fn;},
    document:{title:"Test",hidden:false,addEventListener:(name,fn)=>{listeners[name]=fn;}}});
  load(c,"spotify-auth.js");await c.Bamboc.auth.login();
  const before=c.sessionStorage.getItem("bamboc.spotify.pkce");
  listeners.pagehide({persisted:true});listeners.pageshow({persisted:true});
  c.document.hidden=true;listeners.visibilitychange();
  assert.equal(c.sessionStorage.getItem("bamboc.spotify.pkce"),before);
  for(const event of ["pagehide","pageshow","visibility"])assert.ok(oauthEvents(c).some(e=>e.event===event));
});
test("OAuth mobile: diagnostic storage failure never interrupts login or hides in-memory failure", async()=>{
  const c=authFixture({},async()=>{}),set=c.sessionStorage.setItem;
  c.sessionStorage.setItem=(key,value)=>{if(key==="bamboc.oauth.diagnostic.v1")throw Error("blocked");set(key,value);};
  await c.Bamboc.auth.login();assert.ok(c.location.assigned);
  c.location.href="https://test.example/game/?code=c&state=wrong";
  await assert.rejects(c.Bamboc.auth.handleRedirect());
  const d=c.Bamboc.oauthDiagnostics.snapshot();assert.equal(d.storageWritable,false);assert.equal(d.failed,true);
});

test("release: HTML loads no diagnostic observer, panel, JSON dump or DRM probe", async()=>{
  const html=await readFile(new URL("index.html",root),"utf8");
  assert.doesNotMatch(html,/diagnostic|observer|Verifica DRM|<pre\b|tests\/support/i);
  const css=await readFile(new URL("style.css",root),"utf8");
  assert.doesNotMatch(css,/diagnostic/);
  for(const [,file] of html.matchAll(/src="([^":]+\.js)"/g))assert.ok(file==="core.js"||sources[file],file);
});
test("release: normal mode runs QR/countdown/direct offset/confirmation/reveal/next without observers", async()=>{
  const clock=fakeClock(),gate=defer();
  const player=playerFixture({production:true,realAuth:true,tokens:savedSession(),apiGate:gate.promise});
  const f=appFixture({clock,context:player.c,realSession:true,preplayMs:3000});await flush();
  assert.equal(f.c.Bamboc.config.debug,false);
  assert.equal(f.c.Bamboc.oauthDiagnostics,undefined);assert.equal(f.c.Bamboc.browserDiagnostics,undefined);
  const reports=[],writes=[],statuses=[];player.api.onDiagnostic(d=>reports.push(d));
  Object.defineProperty(f.element("preplay-count"),"textContent",{set:value=>writes.push(value)});
  Object.defineProperty(f.element("status"),"textContent",{set:value=>statuses.push(value)});
  f.c.performance={now:()=>{throw Error("Unexpected diagnostic clock sampling");}};
  for(const key of ["userAgent","userAgentData","requestMediaKeySystemAccess","permissions"])
    Object.defineProperty(f.c.navigator,key,{get(){throw Error("Unexpected browser environment probe");}});
  f.click("scan-btn");await flush();const pending=f.scan("spotify:track:"+id);await flush();
  for(let i=0;i<3;i++){assert.equal(player.requests.length,0);assert.equal(player.audio.length,0);await clock.advance(1000);}
  assert.deepEqual(writes,["3","2","1"]);assert.equal(f.element("preplay").hidden,true);
  assert.equal(f.element("timer").hidden,true);assert.equal(player.requests.length,1);
  const request=player.requests[0];assert.match(request.path,/\/me\/player\/play\?device_id=/);
  assert.ok(request.body.position_ms>=1000&&request.body.position_ms<=song.durationMs-47000);
  assert.deepEqual(plain(request.body.uris),["spotify:track:"+id]);
  assert.equal(player.calls.includes("seek"),false);assert.equal(player.calls.includes("pause"),false);
  await clock.advance(1000);assert.deepEqual(writes,["3","2","1"]);assert.equal(f.element("timer").hidden,true);
  gate.resolve();await pending;assert.equal(f.element("countdown").textContent,"45");
  assert.equal(f.element("timer").hidden,false);assert.equal(reports.length,0);
  assert.ok(f.calls.indexOf("camera stop")>=0);
  f.click("reveal-btn");await flush();
  const back=f.element("result").children[0].children[1];
  assert.deepEqual(back.children.map(x=>x.textContent),[song.title,song.artist,song.year]);
  assert.ok(player.calls.includes("pause"));f.click("reset-btn");await flush();
  assert.equal(f.element("scanner-container").hidden,false);
  f.click("cancel-btn");await flush();f.pagehide();
  assert.equal(statuses.some(s=>/Preparazione|^VIA$/.test(s)),false);
  assert.equal(player.requests.some(r=>/\/tracks\//.test(r.path)),false);
});
test("release: real auth callback succeeds without observer or diagnostic storage writes", async()=>{
  const f=sessionFixture({production:true,tokens:{},callback:"https://test.example/game/?code=c&state=s",
    pkce:{verifier:"v",state:"s",createdAt:Date.now()},
    fetcher:async()=>response(200,{access_token:"a",refresh_token:"r",expires_in:3600})});await flush();
  assert.equal(f.element("scan-btn").disabled,false);assert.equal(f.player.api.isReady(),true);
  assert.equal(f.c.sessionStorage.getItem("bamboc.oauth.diagnostic.v1"),null);
  assert.equal(f.c.sessionStorage.getItem("bamboc.spotify.diagnostics"),null);
  f.click("logout-btn");await flush();assertLoggedOut(f);
});
test("release: invalid callback and SDK errors keep explicit UX with no diagnostic dependency", async()=>{
  const bad=sessionFixture({production:true,callback:"https://test.example/game/?code=c&state=s"});await flush();
  assertLoggedOut(bad);assert.match(bad.element("status").textContent,/Login non valido o scaduto/);
  assert.equal(bad.player.instances.length,0);
  const f=sessionFixture({production:true});await flush();
  f.player.instance.emit("initialization_error",{message:"SECRET_SDK"});await flush();
  assert.equal(f.element("scan-btn").disabled,true);
  assert.match(f.element("status").textContent,/contenuti protetti/);
  assert.doesNotMatch(f.element("status").textContent,/Diagnostica|SECRET/);f.pagehide();
});
test("release: missing local duration and HTTP failure still reject without publishing debug snapshots", async()=>{
  const f=playerFixture({production:true}),reports=[];f.api.onDiagnostic(d=>reports.push(d));
  await assert.rejects(f.api.play({...song,durationMs:undefined}),e=>e.code==="LOCAL_DURATION_MISSING");
  assert.equal(f.requests.length,0);assert.equal(reports.length,0);
  const g=playerFixture({production:true,realAuth:true,tokens:savedSession(),fetcher:async()=>response(403)});
  await assert.rejects(g.api.play(song),e=>e.status===403);
  assert.equal(g.instance.disconnected,true);
});
test("release: production logging retains safe error codes/status only and drops payloads", ()=>{
  const logs=[],c=environment({production:true,console:{warn:(...args)=>logs.push(args),debug:()=>{throw Error("verbose log");}}});
  c.Bamboc.diagnostics("AUTH","token_valid",{access_token:"SECRET_TOKEN"});
  c.Bamboc.diagnostics("AUTH","error",{phase:"token_exchange",type:"TOKEN_EXCHANGE_400",status:400,
    access_token:"SECRET_TOKEN",refresh_token:"SECRET_REFRESH",code:"SECRET_CODE",verifier:"SECRET_VERIFIER",message:"SECRET_MESSAGE"});
  assert.equal(logs.length,1);assert.equal(logs[0][1].status,400);
  assert.equal(JSON.stringify(logs).includes("SECRET"),false);
});

test("visual redesign preserves unique functional DOM hooks and script order", async()=>{
  const html=await readFile(new URL("index.html",root),"utf8");
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);
  for(const hook of ["login-screen","login-btn","game-screen","scan-btn","scanner-container","reader",
    "cancel-btn","preplay","preplay-count","go-label","timer","progress-ring-circle","countdown",
    "reveal-btn","result","reset-btn","connect-btn","logout-btn","status"])
    assert.ok(ids.includes(hook),hook);
  assert.deepEqual([...html.matchAll(/<script defer src="([^"]+)"/g)].map(m=>m[1]),[
    "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js","config.js","core.js","spotify-auth.js",
    "player.js","scanner.js","song.js","app.js"]);
  assert.match(html,/id="result"[^>]*aria-live="polite"[^>]*hidden/);
  assert.match(html,/id="go-label"[^>]*hidden><\/div>/);
  assert.doesNotMatch(html,/>\s*(?:Preparazione(?:\.{3}|…)?|VIA)\s*</);
});
test("visual redesign keeps hidden authoritative, reduced motion, safe areas and unchanged ring geometry", async()=>{
  const css=await readFile(new URL("style.css",root),"utf8");
  const html=await readFile(new URL("index.html",root),"utf8");
  assert.match(css,/\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(css,/prefers-reduced-motion:\s*reduce/);
  assert.match(css,/animation:\s*none\s*!important/);
  assert.match(css,/min-height:\s*100dvh/);
  for(const side of ["top","bottom","left","right"])assert.ok(css.includes("safe-area-inset-"+side));
  assert.match(css,/pointer-events:\s*none/);
  assert.match(html,/id="progress-ring-circle"[^>]*cx="90" cy="90" r="80"/);
  assert.match(css,/stroke-dasharray:\s*502\.6548245743669/);
});

let failures=0;
export const results = [];
for (const {name,run} of tests) {
  try {await run();results.push({name, passed:true});console.log("PASS " + name);}
  catch(error) {failures++;results.push({name, passed:false, error:error.stack});console.error("FAIL "+name+"\n"+error.stack);}
}
console.log(tests.length + " tests; " + failures + " failures.");
if (failures) throw new Error(JSON.stringify(results.filter(result => !result.passed), null, 2));
