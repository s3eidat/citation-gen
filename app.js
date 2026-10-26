/* Citation Gen — every citation is formatted locally from the fields you type. */
(function () {
  "use strict";
  var $ = S3.$, $$ = S3.$$;
  var KEY = "cite.v1";
  var HTTPS = "https:" + "//"; // split so the source never contains a literal remote URL
  var DOI_BASE = HTTPS + "doi.org/";

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var MON_ABBR = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."]; // MLA 9 and IEEE
  var STYLES = { apa: "APA 7", mla: "MLA 9", chicago: "Chicago author-date", harvard: "Harvard", ieee: "IEEE" };
  var BIB_TITLE = { apa: "References", mla: "Works Cited", chicago: "References", harvard: "Reference list", ieee: "References" };

  // Which fields each source type uses, and what the container is called.
  var TYPES = {
    book: { f: ["title", "edition", "year", "publisher", "place", "doi", "url"], container: "" },
    chapter: { f: ["title", "container", "editors", "edition", "pages", "year", "publisher", "place", "doi", "url"], container: "Book title", title: "Chapter title" },
    journal: { f: ["title", "container", "volume", "issue", "pages", "year", "month", "doi", "url", "accessed"], container: "Journal name", title: "Article title" },
    website: { f: ["title", "container", "year", "month", "day", "url", "accessed"], container: "Website name", title: "Page title" },
    newspaper: { f: ["title", "container", "year", "month", "day", "pages", "url", "accessed"], container: "Newspaper or magazine", title: "Article title" },
    video: { f: ["title", "container", "year", "month", "day", "url", "accessed"], container: "Platform", title: "Video title", auth: "Creator / channel" },
    report: { f: ["title", "number", "year", "publisher", "place", "doi", "url", "accessed"], container: "", title: "Report title", pub: "Organisation / publisher" }
  };

  // ---------- small text helpers ----------
  function clean(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
  function ends(s) { return /[.?!]["”’']?$/.test(s); }
  function q(title, punct) { return "“" + title + (punct && !/[.?!]$/.test(title) ? punct : "") + "”"; } // punctuation inside double quotes
  function ordinal(n) {
    var s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  function edition(e) {
    e = clean(e);
    if (!e) return "";
    var m = /^(\d+)(st|nd|rd|th)?\.?(\s*(ed|edn|edition)\.?)?$/i.exec(e);
    if (m) return +m[1] === 1 ? "" : ordinal(+m[1]);
    return e.replace(/\s*(ed|edn|edition)\.?$/i, "");
  }
  function pages(p) { return clean(p).replace(/\s*[-–—]+\s*/g, "–"); }
  function isRange(p) { return /–/.test(p); }
  // MLA: second number keeps only the digits that change, at least two (127–53, 395–401, 1608–774).
  function mlaPages(p) {
    p = pages(p);
    var m = /^(\d+)–(\d+)$/.exec(p);
    if (!m || +m[1] < 100 || m[2].length !== m[1].length) return p.replace("–", "-");
    for (var k = 2; k < m[2].length; k++) {
      if (m[1].slice(0, -k) === m[2].slice(0, -k)) return m[1] + "-" + m[2].slice(-k);
    }
    return m[1] + "-" + m[2];
  }
  function doiOf(d) { return clean(d).replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, ""); }
  function fullUrl(u) { u = clean(u); return u && !/^[a-z][a-z0-9+.-]*:/i.test(u) ? HTTPS + u : u; }
  function bareUrl(u) { return clean(u).replace(/^https?:\/\//i, ""); }

  var MINOR = new Set(("a an the and but or nor for so yet as at by for from in into of off on onto out over per to up upon via with " +
    "about above across after against along among around before behind below beneath beside between beyond down during except " +
    "inside like near outside past since through throughout toward towards under underneath until within without vs vs. versus").split(" "));
  // Title case for MLA / Chicago / IEEE: never lowercases a word you capitalised on purpose except minor words mid-title.
  function titleCase(s) {
    var words = clean(s).split(" "), out = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i], prev = i ? out[i - 1] : "", first = i === 0 || /[:?!—]$/.test(prev), last = i === words.length - 1;
      var core = w.replace(/^[“"‘'(\[]+|[”"’'),.;:!?\]]+$/g, "").toLowerCase();
      if (!first && !last && MINOR.has(core)) { out.push(w.toLowerCase() === w ? w : w.replace(/[A-Za-z]+/, function (x) { return x.toLowerCase(); })); continue; }
      out.push(w.split("-").map(function (part, j) {
        if (/[A-Z].*[A-Z]|[a-z][A-Z]|\d/.test(part)) return part; // NASA, iPhone, 3D: leave alone
        if (j > 0 && MINOR.has(part.toLowerCase())) return part.toLowerCase();
        return part.replace(/^([^A-Za-zÀ-ɏ]*)([A-Za-zÀ-ɏ])/, function (m0, pre, c) { return pre + c.toUpperCase(); });
      }).join("-"));
    }
    return out.join(" ");
  }

  // ---------- names ----------
  function initials(first, spaced) {
    var parts = clean(first).split(" ").filter(Boolean).map(function (tok) {
      return tok.split("-").map(function (p) { var c = p.replace(/\.$/, ""); return c ? Array.from(c)[0].toUpperCase() + "." : ""; }).join("-");
    });
    return parts.join(spaced ? " " : "");
  }
  function person(a) { return { first: clean(a.first), last: clean(a.last), org: !!a.org }; }
  function invFull(a) { return a.org || !a.first ? a.last : a.last + ", " + a.first; }          // Kahneman, Daniel
  function full(a) { return a.org || !a.first ? a.last : a.first + " " + a.last; }               // Daniel Kahneman
  function apaName(a) { return a.org || !a.first ? a.last : a.last + ", " + initials(a.first, true); }  // Kahneman, D.
  function apaFwd(a) { return a.org || !a.first ? a.last : initials(a.first, true) + " " + a.last; }    // D. Kahneman
  function harvName(a) { return a.org || !a.first ? a.last : a.last + ", " + initials(a.first, false); } // Sussman, G.J.
  function ieeeName(a) { return a.org || !a.first ? a.last : initials(a.first, true) + " " + a.last; }  // G. J. Sussman
  function list(names, sep, lastSep) {
    if (names.length < 2) return names.join("");
    return names.slice(0, -1).join(sep) + lastSep + names[names.length - 1];
  }

  var AUTH = {
    apa: function (au) {
      var n = au.map(apaName);
      if (n.length === 1) return n[0];
      if (n.length === 2) return n[0] + ", & " + n[1];
      if (n.length <= 20) return list(n, ", ", ", & ");
      return n.slice(0, 19).join(", ") + ", . . . " + n[n.length - 1];
    },
    mla: function (au) {
      if (au.length === 1) return invFull(au[0]);
      if (au.length === 2) return invFull(au[0]) + ", and " + full(au[1]);
      return invFull(au[0]) + ", et al.";
    },
    chicago: function (au) {
      if (au.length > 10) return [invFull(au[0])].concat(au.slice(1, 7).map(full)).join(", ") + ", et al.";
      var n = [invFull(au[0])].concat(au.slice(1).map(full));
      if (n.length === 2) return n[0] + ", and " + n[1];
      return list(n, ", ", ", and ");
    },
    harvard: function (au) {
      var n = au.map(harvName);
      if (n.length >= 4) return n[0] + " et al.";
      return list(n, ", ", " and ");
    },
    ieee: function (au) {
      var n = au.map(ieeeName);
      if (n.length >= 7) return n[0] + " et al.";
      if (n.length === 2) return n[0] + " and " + n[1];
      return list(n, ", ", ", and ");
    }
  };
  function parseEditors(s) {
    return clean(s).split(/\s*;\s*/).filter(Boolean).map(function (e) {
      if (/,/.test(e)) { var p = e.split(/\s*,\s*/); return { last: p[0], first: p.slice(1).join(" "), org: false }; }
      var w = e.split(" "); return w.length < 2 ? { last: e, first: "", org: true } : { last: w.pop(), first: w.join(" "), org: false };
    });
  }

  // ---------- dates ----------
  function D(f) { return { y: clean(f.year), m: +f.month || 0, d: +clean(f.day) || 0 }; }
  function acc(f) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.accessed || ""); return m ? { y: m[1], m: +m[2], d: +m[3] } : null; }
  function mdy(t, abbr) { return t.m ? (abbr ? MON_ABBR : MONTHS)[t.m - 1] + (t.d ? " " + t.d : "") + (t.y ? ", " + t.y : "") : t.y; } // March 15, 2021
  function dmy(t, abbr) { return (t.d && t.m ? t.d + " " : "") + (t.m ? (abbr ? MON_ABBR : MONTHS)[t.m - 1] + " " : "") + t.y; } // 15 Mar. 2021

  // ---------- the builder: a list of {t, i} runs, i = italic ----------
  function Out() { this.r = []; }
  Out.prototype.add = function (t, it) { if (t) this.r.push({ t: String(t), i: !!it }); return this; };
  Out.prototype.i = function (t) { return this.add(t, true); };
  Out.prototype.text = function () { return this.r.map(function (x) { return x.t; }).join(""); };
  Out.prototype.dot = function () { // end a sentence once (never ". ." or "..")
    while (this.r.length && /\s$/.test(this.r[this.r.length - 1].t)) {
      var l = this.r[this.r.length - 1]; l.t = l.t.replace(/\s+$/, ""); if (!l.t) this.r.pop();
    }
    if (this.r.length && !ends(this.text())) this.add(".");
    return this;
  };
  Out.prototype.sp = function () { if (this.r.length && !/\s$/.test(this.text())) this.add(" "); return this; };
  Out.prototype.runs = function () {
    var out = [];
    this.r.forEach(function (x) { var l = out[out.length - 1]; if (l && l.i === x.i) l.t += x.t; else out.push({ t: x.t, i: x.i }); });
    if (out.length) out[out.length - 1].t = out[out.length - 1].t.replace(/\s+$/, "");
    return out;
  };

  function prep(src, style) {
    var f = {}, k;
    for (k in src) f[k] = typeof src[k] === "string" ? clean(src[k]) : src[k];
    f.authors = (src.authors || []).map(person).filter(function (a) { return a.last || a.first; })
      .map(function (a) { return a.last ? a : { first: "", last: a.first, org: a.org }; });
    var tc = src.autoCase !== false && (style === "mla" || style === "chicago");
    f.T = tc ? titleCase(f.title) : f.title;             // the work's own title
    f.Tbook = (tc || (style === "ieee" && src.autoCase !== false)) ? titleCase(f.title) : f.title;
    f.C = f.container;
    f.ed = edition(f.edition);
    f.pg = pages(f.pages);
    f.doi = doiOf(f.doi);
    f.date = D(f);
    f.acc = acc(f);
    f.eds = parseEditors(f.editors || "");
    return f;
  }

  // ---------- APA 7 ----------
  function apa(src) {
    var f = prep(src, "apa"), o = new Out(), t = src.type, d = f.date;
    var fullDate = t === "website" || t === "newspaper" || t === "video";
    var date = "(" + (d.y ? d.y + (fullDate && d.m ? ", " + MONTHS[d.m - 1] + (d.d ? " " + d.d : "") : "") : "n.d.") + ")";
    var italicTitle = t === "book" || t === "website" || t === "video" || t === "report";
    function title() {
      if (italicTitle) o.i(f.T); else o.add(f.T);
      if (t === "book" && f.ed) o.add(" (" + f.ed + " ed.)");
      if (t === "report" && f.number) o.add(" (" + (/^\D/.test(f.number) && !/^no\.?\s/i.test(f.number) ? f.number : "Report No. " + f.number.replace(/^no\.?\s*/i, "")) + ")");
      if (t === "video") o.add(" [Video]");
      o.dot().sp();
    }
    if (f.authors.length) { o.add(AUTH.apa(f.authors)).dot().sp().add(date + ".").sp(); if (f.T) title(); }
    else { if (f.T) title(); o.add(date + ".").sp(); }
    var authorIsPub = f.authors.length === 1 && f.authors[0].org && f.authors[0].last === f.publisher;
    if (t === "book") { if (f.publisher) o.add(f.publisher).dot().sp(); }
    else if (t === "report") { if (f.publisher && !authorIsPub) o.add(f.publisher).dot().sp(); }
    else if (t === "chapter") {
      o.add("In ");
      if (f.eds.length) o.add((f.eds.length === 1 ? apaFwd(f.eds[0]) : f.eds.length === 2 ? apaFwd(f.eds[0]) + " & " + apaFwd(f.eds[1]) : list(f.eds.map(apaFwd), ", ", ", & ")) + (f.eds.length > 1 ? " (Eds.), " : " (Ed.), "));
      o.i(f.C);
      var bits = [];
      if (f.ed) bits.push(f.ed + " ed.");
      if (f.pg) bits.push((isRange(f.pg) ? "pp. " : "p. ") + f.pg);
      if (bits.length) o.add(" (" + bits.join(", ") + ")");
      o.dot().sp();
      if (f.publisher) o.add(f.publisher).dot().sp();
    } else if (t === "journal") {
      if (f.C) {
        o.i(f.C + (f.volume ? ", " : ""));
        if (f.volume) o.i(f.volume);
        if (f.issue) o.add("(" + f.issue + ")");
        if (f.pg) o.add(", " + f.pg);
        o.dot().sp();
      }
    } else if (t === "website") {
      var same = f.authors.length === 1 && f.authors[0].last === f.C;
      if (f.C && !same) o.add(f.C).dot().sp();
    } else if (t === "newspaper") {
      if (f.C) { o.i(f.C); if (f.pg) o.add(", " + f.pg); o.dot().sp(); }
    } else if (t === "video") {
      if (f.C) o.add(f.C).dot().sp();
    }
    if (f.doi) o.add(DOI_BASE + f.doi);
    else if (f.url) o.add(fullUrl(f.url));
    return o;
  }

  // ---------- MLA 9 ----------
  function mla(src) {
    var f = prep(src, "mla"), o = new Out(), t = src.type, d = f.date, els = [];
    var authorIsPub = f.authors.length === 1 && f.authors[0].org && f.authors[0].last === f.publisher;
    if (f.authors.length && !authorIsPub) o.add(AUTH.mla(f.authors)).dot().sp();
    var quoted = t === "chapter" || t === "journal" || t === "website" || t === "newspaper" || t === "video";
    if (f.T) { if (quoted) o.add(q(f.T, ".")); else o.i(f.T).dot(); o.sp(); }
    // Container and the rest, comma separated, one period at the end.
    function el(txt, it) { els.push({ t: txt, i: !!it }); }
    var date = d.y ? dmy(d, true) : "";
    if (t === "book" || t === "report") {
      if (f.ed && t === "book") el(f.ed + " ed.");
      if (f.publisher) el(f.publisher);
      if (date) el(t === "book" ? d.y : date);
    } else if (t === "chapter") {
      if (f.C) el(titleIf(f.C, src), true);
      if (f.eds.length) el("edited by " + (f.eds.length === 1 ? full(f.eds[0]) : f.eds.length === 2 ? full(f.eds[0]) + " and " + full(f.eds[1]) : full(f.eds[0]) + " et al."));
      if (f.ed) el(f.ed + " ed.");
      if (f.publisher) el(f.publisher);
      if (d.y) el(d.y);
      if (f.pg) el((isRange(f.pg) ? "pp. " : "p. ") + mlaPages(f.pg));
    } else if (t === "journal") {
      if (f.C) el(f.C, true);
      if (f.volume) el("vol. " + f.volume);
      if (f.issue) el("no. " + f.issue);
      if (date) el(date);
      if (f.pg) el((isRange(f.pg) ? "pp. " : "p. ") + mlaPages(f.pg));
    } else {
      if (f.C) el(f.C, true);
      if (date) el(date);
      if (t === "newspaper" && f.pg) el((isRange(f.pg) ? "pp. " : "p. ") + mlaPages(f.pg));
    }
    if (f.doi) el(DOI_BASE + f.doi);
    else if (f.url) el(bareUrl(f.url));
    els.forEach(function (e, i) { o.add(e.t, e.i); o.add(i < els.length - 1 ? ", " : ""); });
    o.dot();
    if (f.acc && !d.y && f.url && !f.doi) o.sp().add("Accessed " + dmy(f.acc, true) + ".");
    return o;
  }
  function titleIf(s, src) { return src.autoCase !== false ? titleCase(s) : s; }

  // ---------- Chicago author-date (17th) ----------
  function chicago(src) {
    var f = prep(src, "chicago"), o = new Out(), t = src.type, d = f.date;
    var year = d.y || "n.d.";
    var italicTitle = t === "book" || t === "report";
    function title() { if (italicTitle) o.i(f.T); else o.add(q(f.T, ".")); o.dot().sp(); }
    if (f.authors.length) { o.add(AUTH.chicago(f.authors)).dot().sp().add(year + ".").sp(); if (f.T) title(); }
    else { if (f.T) title(); o.add(year + ".").sp(); }
    function place() { var s = f.place && f.publisher ? f.place + ": " + f.publisher : f.publisher || f.place; if (s) o.add(s).dot().sp(); }
    if (t === "book") { if (f.ed) o.add(f.ed + " ed.").sp(); place(); }
    else if (t === "report") { if (f.number) o.add(/^\D/.test(f.number) ? f.number : "Report no. " + f.number).dot().sp(); place(); }
    else if (t === "chapter") {
      o.add("In ").i(titleIf(f.C, src));
      if (f.eds.length) o.add(", edited by " + list(f.eds.map(full), ", ", f.eds.length === 2 ? " and " : ", and "));
      if (f.ed) o.add(", " + f.ed + " ed.");
      if (f.pg) o.add(", " + f.pg);
      o.dot().sp(); place();
    } else if (t === "journal") {
      if (f.C) {
        o.i(f.C);
        if (f.volume) o.add(" " + f.volume);
        if (f.issue) o.add(" (" + f.issue + ")");
        if (f.pg) o.add((f.volume || f.issue ? ": " : ", ") + f.pg);
        o.dot().sp();
      }
    } else if (t === "website") {
      if (f.C) o.add(f.C).dot().sp();
      if (d.y && d.m) o.add(mdy(d)).dot().sp();
    } else if (t === "newspaper") {
      if (f.C) { o.i(f.C); if (d.m) o.add(", " + mdy(d)); o.dot().sp(); }
    } else if (t === "video") {
      o.add((f.C ? f.C + " video" : "Video") + (d.m ? ", " + mdy(d) : "")).dot().sp();
    }
    if (f.acc && !d.y && f.url && !f.doi) o.add("Accessed " + mdy(f.acc)).dot().sp();
    if (f.doi) o.add(DOI_BASE + f.doi).dot();
    else if (f.url) o.add(fullUrl(f.url)).dot();
    return o;
  }

  // ---------- Harvard (Cite Them Right) ----------
  function harvard(src) {
    var f = prep(src, "harvard"), o = new Out(), t = src.type, d = f.date;
    var year = "(" + (d.y || "no date") + ")";
    var italicTitle = t === "book" || t === "website" || t === "video" || t === "report";
    function title() { if (italicTitle) o.i(f.T); else o.add("‘" + f.T + "’"); }
    if (f.authors.length) { o.add(AUTH.harvard(f.authors)).sp().add(year).sp(); if (f.T) title(); }
    else { if (f.T) title(); o.sp().add(year); }
    function place() { var s = f.place && f.publisher ? f.place + ": " + f.publisher : f.publisher || f.place; if (s) o.add(s); return !!s; }
    if (t === "book") { o.dot().sp(); if (f.ed) o.add(f.ed + " edn.").sp(); if (place()) o.dot().sp(); }
    else if (t === "report") { o.dot().sp(); if (f.number) o.add(/^\D/.test(f.number) ? f.number : "Report " + f.number).dot().sp(); if (place()) o.dot().sp(); }
    else if (t === "chapter") {
      o.add(", in ");
      if (f.eds.length) o.add(AUTH.harvard(f.eds) + " (" + (f.eds.length > 1 ? "eds" : "ed.") + ") ");
      o.i(f.C).dot().sp();
      if (f.ed) o.add(f.ed + " edn.").sp();
      var hasPub = place();
      if (f.pg) o.add((hasPub ? ", " : "") + (isRange(f.pg) ? "pp. " : "p. ") + f.pg);
      o.dot().sp();
    } else if (t === "journal") {
      if (f.C) o.add(", ").i(f.C);
      if (f.volume) o.add(", " + f.volume + (f.issue ? "(" + f.issue + ")" : ""));
      else if (f.issue) o.add(", (" + f.issue + ")");
      if (f.pg) o.add(", " + (isRange(f.pg) ? "pp. " : "p. ") + f.pg);
      o.dot().sp();
    } else if (t === "newspaper") {
      if (f.C) o.add(", ").i(f.C);
      if (d.m) o.add(", " + (d.d ? d.d + " " : "") + MONTHS[d.m - 1]);
      if (f.pg) o.add(", " + (isRange(f.pg) ? "pp. " : "p. ") + f.pg);
      o.dot().sp();
    } else if (t === "video") {
      if (f.C) o.add(" [" + f.C + "]");
      o.dot().sp();
    } else o.dot().sp();
    if (f.doi) o.add("Available at: " + DOI_BASE + f.doi).dot();
    else if (f.url) o.add("Available at: " + fullUrl(f.url) + (f.acc ? " (Accessed: " + dmy(f.acc) + ")" : "")).dot();
    return o;
  }

  // ---------- IEEE ----------
  function ieee(src) {
    var f = prep(src, "ieee"), o = new Out(), t = src.type, d = f.date;
    var au = f.authors.length ? AUTH.ieee(f.authors) : "";
    var place = f.place && f.publisher ? f.place + ": " + f.publisher : f.publisher || f.place;
    var online = f.url && !f.doi;
    if (t === "website") {
      if (au) o.add(au).dot().sp();
      if (f.T) o.add(q(f.T, ".")).sp();
      if (f.C) o.add(f.C).dot().sp();
      if (f.url) o.add(fullUrl(f.url) + (f.acc ? " (accessed " + mdy(f.acc, true) + ")" : "")).dot();
      return o;
    }
    if (t === "video") {
      if (au) o.add(au).dot().sp();
      if (f.T) o.add(f.T).dot().sp();
      if (d.y) o.add("(" + mdy(d, true) + ").").sp();
      if (f.acc) o.add("Accessed: " + mdy(f.acc, true) + ".").sp();
      if (f.url) o.add("[Online Video]. Available: " + fullUrl(f.url));
      return o;
    }
    if (au) o.add(au + ", ");
    if (t === "book") {
      o.i(f.Tbook);
      if (f.ed) o.add(", " + f.ed + " ed.");
      o.dot().sp();
      if (place) o.add(place + (d.y ? ", " : ""));
      if (d.y) o.add(d.y);
      o.dot();
    } else if (t === "chapter") {
      o.add(q(f.T, ",")).add(" in ").i(titleIf(f.C, src));
      if (f.eds.length) o.add(", " + AUTH.ieee(f.eds) + (f.eds.length > 1 ? ", Eds" : ", Ed"));
      if (f.ed) o.add(", " + f.ed + " ed");
      o.add(".").sp();
      var parts = [];
      if (place) parts.push(place);
      if (d.y) parts.push(d.y);
      if (f.pg) parts.push((isRange(f.pg) ? "pp. " : "p. ") + f.pg);
      o.add(parts.join(", ")).dot();
    } else if (t === "journal") {
      o.add(q(f.T, ","));
      var j = [];
      if (f.C) j.push({ t: f.C, i: true });
      if (f.volume) j.push({ t: "vol. " + f.volume });
      if (f.issue) j.push({ t: "no. " + f.issue });
      if (f.pg) j.push({ t: (isRange(f.pg) ? "pp. " : "p. ") + f.pg });
      if (d.y) j.push({ t: (d.m ? MON_ABBR[d.m - 1] + " " : "") + d.y });
      if (f.doi) j.push({ t: "doi: " + f.doi });
      o.sp();
      j.forEach(function (x, i) { o.add(x.t, x.i); if (i < j.length - 1) o.add(", "); });
      o.dot();
    } else if (t === "newspaper") {
      o.add(q(f.T, ",")).sp();
      if (f.C) o.i(f.C);
      if (d.y) o.add(", " + mdy(d, true));
      if (f.pg) o.add(", " + (isRange(f.pg) ? "pp. " : "p. ") + f.pg);
      o.dot();
    } else if (t === "report") {
      o.add(q(f.T, ",")).sp();
      var r = [];
      if (f.publisher) r.push(f.publisher);
      if (f.place) r.push(f.place);
      if (f.number) r.push(/^\D/.test(f.number) ? f.number : "Rep. " + f.number);
      if (d.y) r.push(d.y);
      o.add(r.join(", ")).dot();
      if (f.doi) o.sp().add("doi: " + f.doi).dot();
    }
    if (online) o.sp().add("[Online]. Available: " + fullUrl(f.url));
    else if (f.doi && t !== "journal" && t !== "report") o.sp().add("doi: " + f.doi).dot();
    return o;
  }

  var FORMAT = { apa: apa, mla: mla, chicago: chicago, harvard: harvard, ieee: ieee };
  function format(src, style) { return FORMAT[style](src); }

  // In-text (parenthetical) citation.
  function inText(src, style, n) {
    if (style === "ieee") return "[" + (n || 1) + "]";
    var au = (src.authors || []).map(person).filter(function (a) { return a.last || a.first; }).map(function (a) { return a.last || a.first; });
    var y = clean(src.year) || (style === "harvard" ? "no date" : "n.d."), who;
    if (!au.length) { var t = clean(src.title).split(" ").slice(0, 4).join(" "); who = /^(book|report|website|video)$/.test(src.type) && style !== "mla" ? t : "“" + t + "”"; }
    else if (style === "apa") who = au.length === 1 ? au[0] : au.length === 2 ? au[0] + " & " + au[1] : au[0] + " et al.";
    else if (style === "mla") who = au.length === 1 ? au[0] : au.length === 2 ? au[0] + " and " + au[1] : au[0] + " et al.";
    else if (style === "chicago") who = au.length === 1 ? au[0] : au.length === 2 ? au[0] + " and " + au[1] : au.length === 3 ? au[0] + ", " + au[1] + ", and " + au[2] : au[0] + " et al.";
    else who = au.length === 1 ? au[0] : au.length === 2 ? au[0] + " and " + au[1] : au.length === 3 ? au[0] + ", " + au[1] + " and " + au[2] : au[0] + " et al.";
    if (style === "mla") return "(" + who + ")";
    if (style === "chicago") return "(" + who + " " + y + ")";
    return "(" + who + ", " + y + ")";
  }

  // ---------- rendering ----------
  function toNodes(runs, el) {
    el.textContent = "";
    runs.forEach(function (r) { el.appendChild(r.i ? S3.h("i", { text: r.t }) : document.createTextNode(r.t)); });
  }
  function toHtml(runs) { return runs.map(function (r) { return r.i ? "<i>" + S3.esc(r.t) + "</i>" : S3.esc(r.t); }).join(""); }
  function plain(runs) { return runs.map(function (r) { return r.t; }).join(""); }

  // Rich copy keeps italics in Word / Google Docs; falls back to plain text.
  function copyRich(html, text) {
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write && window.isSecureContext) {
      var item = new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) });
      return navigator.clipboard.write([item]).then(function () { S3.toast("Copied with formatting ✓"); }, function () { return S3.copy(text); });
    }
    return S3.copy(text);
  }

  // ---------- state + form ----------
  var FIELDS = ["title", "container", "editors", "year", "month", "day", "edition", "volume", "issue", "pages", "number", "publisher", "place", "doi", "url", "accessed"];
  var saved = S3.store(KEY) || {};
  var state = { style: STYLES[saved.style] ? saved.style : "apa", list: Array.isArray(saved.list) ? saved.list : [], editing: null };

  function authorRow(a) {
    a = a || {};
    var first = S3.h("input", { "class": "input", dir: "auto", autocomplete: "off", placeholder: "First / given", "aria-label": "First name" });
    var last = S3.h("input", { "class": "input", dir: "auto", autocomplete: "off", placeholder: "Last / family", "aria-label": "Last name" });
    var org = S3.h("input", { type: "checkbox", "aria-label": "Organisation" });
    first.value = a.first || ""; last.value = a.last || ""; org.checked = !!a.org;
    var row = S3.h("div", { "class": "cg-author" }, [first, last,
      S3.h("label", { "class": "check", title: "Organisation as author" }, [org, "Org"]),
      S3.h("button", { "class": "btn ghost icon small", type: "button", "aria-label": "Remove author", html: S3.icon("x") })]);
    function sync() { row.classList.toggle("is-org", org.checked); last.placeholder = org.checked ? "Organisation name" : "Last / family"; }
    org.addEventListener("change", function () { sync(); render(); });
    row.lastChild.addEventListener("click", function () { row.remove(); render(); });
    [first, last].forEach(function (x) { x.addEventListener("input", render); });
    sync();
    return row;
  }
  function readForm() {
    var src = { type: $("#type").value, autoCase: $("#autoCase").checked, authors: [] };
    $$(".cg-author").forEach(function (r) {
      var ins = $$("input", r);
      var org = ins[2].checked;
      src.authors.push({ first: org ? "" : ins[0].value, last: ins[1].value, org: org });
    });
    var use = TYPES[src.type].f;
    FIELDS.forEach(function (k) { src[k] = use.indexOf(k) >= 0 ? $("#f-" + k).value : ""; });
    return src;
  }
  function fillForm(src) {
    $("#type").value = src.type || "book";
    $("#autoCase").checked = src.autoCase !== false;
    FIELDS.forEach(function (k) { $("#f-" + k).value = src[k] || ""; });
    var box = $("#authors"); box.textContent = "";
    (src.authors && src.authors.length ? src.authors : [{}]).forEach(function (a) { box.appendChild(authorRow(a)); });
    applyType();
  }
  function applyType() {
    var t = TYPES[$("#type").value];
    $$("#form [data-k]").forEach(function (el) { el.hidden = t.f.indexOf(el.dataset.k) < 0; });
    var c = $("[data-k=container] span"); if (c) c.textContent = t.container || "Container";
    $("[data-k=title] span").textContent = t.title || "Title";
    $("[data-k=publisher] span").textContent = t.pub || "Publisher";
    $("#authLabel").textContent = t.auth || "Authors";
  }

  function render() {
    var src = readForm(), st = state.style;
    persistDraft(src);
    $("#styleName").textContent = STYLES[st];
    var warn = $("#warn"), missing = [];
    if (!clean(src.title)) missing.push("title");
    if (!clean(src.year) && src.type !== "website") missing.push("year");
    if (TYPES[src.type].f.indexOf("container") >= 0 && !clean(src.container)) missing.push(TYPES[src.type].container.toLowerCase());
    warn.hidden = !missing.length; warn.className = "chip warn"; warn.textContent = missing.length ? "Missing: " + missing.join(", ") : "";
    if (!clean(src.title) && !src.authors.some(function (a) { return clean(a.last); })) {
      $("#out").innerHTML = '<div class="empty"><b>Your citation appears here</b>Start with the title and authors, or press Sample.</div>';
      $("#intext").textContent = "";
    } else {
      toNodes(format(src, st).runs(), $("#out"));
      $("#intext").textContent = inText(src, st, state.editing != null ? indexOf(state.editing) + 1 : state.list.length + 1);
    }
    $("#add span").textContent = state.editing != null ? "Update entry" : "Add to bibliography";
    renderBib();
  }
  function indexOf(id) { for (var i = 0; i < state.list.length; i++) if (state.list[i].id === id) return i; return -1; }

  function sortKey(text) { return text.replace(/^[^\p{L}\p{N}]+/u, "").replace(/^(the|a|an)\s+/i, "").toLocaleLowerCase(); }
  function bibEntries() {
    var st = state.style;
    var rows = state.list.map(function (e, i) { var runs = format(e.src, st).runs(); return { e: e, runs: runs, text: plain(runs), n: i }; });
    if (st !== "ieee") rows.sort(function (a, b) { return sortKey(a.text).localeCompare(sortKey(b.text)); });
    return rows;
  }
  function renderBib() {
    var st = state.style, bib = $("#bib"), rows = bibEntries();
    $("#bibTitle").textContent = BIB_TITLE[st];
    $("#count").textContent = rows.length + (rows.length === 1 ? " source" : " sources");
    bib.textContent = "";
    if (!rows.length) {
      bib.appendChild(S3.h("div", { "class": "empty" }, [S3.h("b", { text: "No sources yet" }), "Add citations and they are listed here, sorted for the style, and kept on this device."]));
      return;
    }
    var ol = S3.h("ol", { "class": "cg-bib" + (st === "ieee" ? " is-num" : "") });
    rows.forEach(function (r, i) {
      var txt = S3.h("div", { "class": "cg-entry" });
      if (st === "ieee") txt.appendChild(S3.h("span", { "class": "cg-num", text: "[" + (i + 1) + "]" }));
      var body = S3.h("span"); toNodes(r.runs, body); txt.appendChild(body);
      var li = S3.h("li", { "class": state.editing === r.e.id ? "is-edit" : "" }, [txt, S3.h("div", { "class": "cg-acts" }, [
        S3.h("button", { "class": "btn ghost small", type: "button", text: "Edit", onclick: function () { state.editing = r.e.id; fillForm(r.e.src); render(); $("#f-title").focus(); } }),
        S3.h("button", { "class": "btn ghost icon small", type: "button", "aria-label": "Copy", html: S3.icon("copy"), onclick: function () { copyRich(toHtml(r.runs), r.text); } }),
        S3.h("button", { "class": "btn ghost icon small", type: "button", "aria-label": "Delete", html: S3.icon("trash"), onclick: function () {
          state.list.splice(indexOf(r.e.id), 1); if (state.editing === r.e.id) state.editing = null; save(); render();
        } })
      ])]);
      ol.appendChild(li);
    });
    bib.appendChild(ol);
  }

  function bibOut() {
    var st = state.style, rows = bibEntries();
    var text = rows.map(function (r, i) { return (st === "ieee" ? "[" + (i + 1) + "] " : "") + r.text; });
    var html = rows.map(function (r, i) { return '<p style="margin:0 0 0 2em;text-indent:-2em">' + (st === "ieee" ? "[" + (i + 1) + "] " : "") + toHtml(r.runs) + "</p>"; });
    return { text: text.join("\n\n"), html: html.join(""), plainDoc: BIB_TITLE[st] + "\n\n" + text.join("\n\n") + "\n" };
  }

  function save() { S3.store(KEY, { style: state.style, list: state.list, draft: state.draft }); }
  var persistDraft = S3.debounce(function (src) { state.draft = src; save(); }, 300);

  // ---------- wiring ----------
  $$("#style button").forEach(function (b) {
    b.setAttribute("aria-pressed", String(b.dataset.v === state.style));
    b.addEventListener("click", function () {
      state.style = b.dataset.v;
      $$("#style button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      save(); render();
    });
  });
  $("#type").addEventListener("change", function () { applyType(); render(); });
  $("#form").addEventListener("input", function (e) { if (e.target.id && e.target.id.indexOf("f-") === 0) render(); });
  $("#form").addEventListener("change", function (e) { if (e.target.id === "autoCase" || e.target.id === "f-month") render(); });
  $("#addAuthor").addEventListener("click", function () { var r = authorRow(); $("#authors").appendChild(r); r.firstChild.focus(); });
  $("#reset").addEventListener("click", function () { state.editing = null; fillForm({ type: $("#type").value }); render(); });

  $("#add").addEventListener("click", function () {
    var src = readForm();
    if (!clean(src.title)) { S3.toast("Add at least a title", "error"); $("#f-title").focus(); return; }
    if (state.editing != null && indexOf(state.editing) >= 0) { state.list[indexOf(state.editing)].src = src; S3.toast("Entry updated"); }
    else { state.list.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), src: src }); S3.toast("Added to " + BIB_TITLE[state.style]); }
    state.editing = null; save(); render(); S3.done();
  });
  $("#copyRich").addEventListener("click", function () {
    var runs = format(readForm(), state.style).runs(); if (!runs.length) return S3.toast("Nothing to copy yet", "error");
    copyRich(toHtml(runs), plain(runs)); S3.done();
  });
  $("#copyPlain").addEventListener("click", function () {
    var runs = format(readForm(), state.style).runs(); if (!runs.length) return S3.toast("Nothing to copy yet", "error");
    S3.copy(plain(runs)); S3.done();
  });
  $("#bibRich").addEventListener("click", function () { if (!state.list.length) return S3.toast("The list is empty", "error"); var b = bibOut(); copyRich(b.html, b.text); S3.done(); });
  $("#bibPlain").addEventListener("click", function () { if (!state.list.length) return S3.toast("The list is empty", "error"); S3.copy(bibOut().text); S3.done(); });
  $("#bibTxt").addEventListener("click", function () {
    if (!state.list.length) return S3.toast("The list is empty", "error");
    S3.download(bibOut().plainDoc, BIB_TITLE[state.style].toLowerCase().replace(/\s+/g, "-") + ".txt", "text/plain"); S3.done();
  });
  $("#bibClear").addEventListener("click", function () {
    if (!state.list.length) return;
    if (!window.confirm("Remove all " + state.list.length + " sources from the list?")) return;
    state.list = []; state.editing = null; save(); render();
  });

  var SAMPLES = {
    book: { type: "book", authors: [{ first: "Harold", last: "Abelson" }, { first: "Gerald Jay", last: "Sussman" }], title: "Structure and interpretation of computer programs", edition: "2", year: "1996", publisher: "MIT Press", place: "Cambridge, MA, USA" },
    website: { type: "website", authors: [{ first: "Linda", last: "Martinez" }], title: "Climate change and coffee farming", container: "Coffee Research Institute", year: "2021", month: "3", day: "15", url: HTTPS + "example.org/coffee", accessed: "2024-05-02" },
    journal: { type: "journal", authors: [{ first: "Amira", last: "Haddad" }, { first: "Omar", last: "Khalil" }, { first: "Sara", last: "Nasser" }], title: "Reading on screens: Effects on comprehension and recall", container: "Journal of Educational Psychology", volume: "112", issue: "4", pages: "715-731", year: "2020", month: "5", doi: "10.1037/edu0000398" },
    chapter: { type: "chapter", authors: [{ first: "Maya", last: "Rahman" }], title: "Designing for slow readers", container: "Handbook of reading research", editors: "Peter Lee; Hana Aziz", pages: "127-153", year: "2019", publisher: "Routledge", place: "New York, NY, USA" },
    video: { type: "video", authors: [{ first: "", last: "Khan Academy", org: true }], title: "Introduction to limits", container: "YouTube", year: "2017", month: "8", day: "10", url: HTTPS + "www.youtube.com/watch?v=riXcZT2ICjA", accessed: "2024-05-02" }
  };
  $("#sample").addEventListener("click", function () {
    var t = $("#type").value, s = SAMPLES[t] || SAMPLES.book;
    if (!SAMPLES[t]) s = Object.assign({}, SAMPLES.book, t === "report" ? { type: "report", authors: [{ last: "World Health Organization", org: true }], title: "World report on vision", publisher: "World Health Organization", place: "Geneva, Switzerland", year: "2019", edition: "", number: "", url: HTTPS + "www.who.int/publications/i/item/9789241516570" } :
      { type: "newspaper", authors: [{ first: "Rami", last: "Saleh" }], title: "City libraries extend opening hours", container: "The Jordan Times", year: "2024", month: "2", day: "8", url: HTTPS + "www.jordantimes.com/news/local/libraries", edition: "", publisher: "", place: "" });
    state.editing = null; fillForm(s); render();
  });

  fillForm(saved.draft || { type: "book" });
  render();

  window.S3_DEMO = function () {
    state.style = "apa";
    $$("#style button").forEach(function (x) { x.setAttribute("aria-pressed", String(x.dataset.v === "apa")); });
    state.list = [SAMPLES.book, SAMPLES.website, SAMPLES.chapter].map(function (s, i) { return { id: "d" + i, src: Object.assign({ autoCase: true }, s) }; });
    state.editing = null;
    fillForm(Object.assign({ autoCase: true }, SAMPLES.journal)); render();
  };

  // ---------- self-test: fixed book and website against the style guides ----------
  window.S3_SELFTEST = function () {
    var fails = [];
    function eq(name, got, want) { if (got !== want) fails.push(name + ": got «" + got + "» want «" + want + "»"); }
    function txt(src, st) { return format(Object.assign({ autoCase: true }, src), st).text().trim(); }
    function its(src, st) { return format(Object.assign({ autoCase: true }, src), st).runs().filter(function (r) { return r.i; }).map(function (r) { return r.t; }).join("|"); }
    var B = SAMPLES.book, W = SAMPLES.website, U = HTTPS + "example.org/coffee";
    eq("apa book", txt(B, "apa"), "Abelson, H., & Sussman, G. J. (1996). Structure and interpretation of computer programs (2nd ed.). MIT Press.");
    eq("apa book italic", its(B, "apa"), "Structure and interpretation of computer programs");
    eq("mla book", txt(B, "mla"), "Abelson, Harold, and Gerald Jay Sussman. Structure and Interpretation of Computer Programs. 2nd ed., MIT Press, 1996.");
    eq("chicago book", txt(B, "chicago"), "Abelson, Harold, and Gerald Jay Sussman. 1996. Structure and Interpretation of Computer Programs. 2nd ed. Cambridge, MA, USA: MIT Press.");
    eq("harvard book", txt(B, "harvard"), "Abelson, H. and Sussman, G.J. (1996) Structure and interpretation of computer programs. 2nd edn. Cambridge, MA, USA: MIT Press.");
    eq("ieee book", txt(B, "ieee"), "H. Abelson and G. J. Sussman, Structure and Interpretation of Computer Programs, 2nd ed. Cambridge, MA, USA: MIT Press, 1996.");
    eq("ieee book italic", its(B, "ieee"), "Structure and Interpretation of Computer Programs");
    eq("apa web", txt(W, "apa"), "Martinez, L. (2021, March 15). Climate change and coffee farming. Coffee Research Institute. " + U);
    eq("mla web", txt(W, "mla"), "Martinez, Linda. “Climate Change and Coffee Farming.” Coffee Research Institute, 15 Mar. 2021, example.org/coffee.");
    eq("mla web italic", its(W, "mla"), "Coffee Research Institute");
    eq("chicago web", txt(W, "chicago"), "Martinez, Linda. 2021. “Climate Change and Coffee Farming.” Coffee Research Institute. March 15, 2021. " + U + ".");
    eq("harvard web", txt(W, "harvard"), "Martinez, L. (2021) Climate change and coffee farming. Available at: " + U + " (Accessed: 2 May 2024).");
    eq("ieee web", txt(W, "ieee"), "L. Martinez. “Climate change and coffee farming.” Coffee Research Institute. " + U + " (accessed May 2, 2024).");
    // Journal with DOI
    var J = SAMPLES.journal;
    eq("apa journal", txt(J, "apa"), "Haddad, A., Khalil, O., & Nasser, S. (2020). Reading on screens: Effects on comprehension and recall. Journal of Educational Psychology, 112(4), 715–731. " + DOI_BASE + "10.1037/edu0000398");
    eq("apa journal italic", its(J, "apa"), "Journal of Educational Psychology, 112");
    eq("mla journal", txt(J, "mla"), "Haddad, Amira, et al. “Reading on Screens: Effects on Comprehension and Recall.” Journal of Educational Psychology, vol. 112, no. 4, May 2020, pp. 715-31, " + DOI_BASE + "10.1037/edu0000398.");
    eq("ieee journal", txt(J, "ieee"), "A. Haddad, O. Khalil, and S. Nasser, “Reading on screens: Effects on comprehension and recall,” Journal of Educational Psychology, vol. 112, no. 4, pp. 715–731, May 2020, doi: 10.1037/edu0000398.");
    // Author-count rules
    function people(n) { var a = []; for (var i = 0; i < n; i++) a.push(person({ first: "Ann", last: "L" + i })); return a; }
    eq("apa 21", AUTH.apa(people(21)).slice(-22), "L18, A., . . . L20, A.");
    eq("mla 3", AUTH.mla(people(3)), "L0, Ann, et al.");
    eq("chicago 11", AUTH.chicago(people(11)), "L0, Ann, Ann L1, Ann L2, Ann L3, Ann L4, Ann L5, Ann L6, et al.");
    eq("harvard 3", AUTH.harvard(people(3)), "L0, A., L1, A. and L2, A.");
    eq("harvard 4", AUTH.harvard(people(4)), "L0, A. et al.");
    eq("ieee 6", AUTH.ieee(people(6)), "A. L0, A. L1, A. L2, A. L3, A. L4, and A. L5");
    eq("ieee 7", AUTH.ieee(people(7)), "A. L0 et al.");
    eq("initials", initials("Jean-Paul K.", true), "J.-P. K.");
    eq("mla pages", [mlaPages("127-153"), mlaPages("395-401"), mlaPages("1608-1774"), mlaPages("96-101"), mlaPages("103-104")].join(" "), "127-53 395-401 1608-774 96-101 103-04");
    eq("title case", titleCase("the lord of the rings: the return of the king"), "The Lord of the Rings: The Return of the King");
    eq("intext", [inText(B, "apa"), inText(B, "mla"), inText(B, "chicago"), inText(J, "harvard"), inText(B, "ieee", 3)].join(" "), "(Abelson & Sussman, 1996) (Abelson and Sussman) (Abelson and Sussman 1996) (Haddad, Khalil and Nasser, 2020) [3]");
    eq("escape", toHtml([{ t: "<b>&", i: true }]), "<i>&lt;b&gt;&amp;</i>");
    return fails.length ? fails : true;
  };
})();
