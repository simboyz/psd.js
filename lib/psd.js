(function() {
  /*!
 *  Copyright © 2008 Fair Oaks Labs, Inc.
 *  All rights reserved.
 */

// Utility object:  Encode/Decode C-style binary primitives to/from octet arrays
function JSPack()
{
  // Module-level (private) variables
  var el,  bBE = false, m = this;


  // Raw byte arrays
  m._DeArray = function (a, p, l)
  {
    return [a.slice(p,p+l)];
  };
  m._EnArray = function (a, p, l, v)
  {
    for (var i = 0; i < l; a[p+i] = v[i]?v[i]:0, i++);
  };

  // ASCII characters
  m._DeChar = function (a, p)
  {
    return String.fromCharCode(a[p]);
  };
  m._EnChar = function (a, p, v)
  {
    a[p] = v.charCodeAt(0);
  };

  // Little-endian (un)signed N-byte integers
  m._DeInt = function (a, p)
  {
    var lsb = bBE?(el.len-1):0, nsb = bBE?-1:1, stop = lsb+nsb*el.len, rv, i, f;
    for (rv = 0, i = lsb, f = 1; i != stop; rv+=(a[p+i]*f), i+=nsb, f*=256);
    if (el.bSigned && (rv & Math.pow(2, el.len*8-1))) { rv -= Math.pow(2, el.len*8); }
    return rv;
  };
  m._EnInt = function (a, p, v)
  {
    var lsb = bBE?(el.len-1):0, nsb = bBE?-1:1, stop = lsb+nsb*el.len, i;
    v = (v<el.min)?el.min:(v>el.max)?el.max:v;
    for (i = lsb; i != stop; a[p+i]=v&0xff, i+=nsb, v>>=8);
  };

  // ASCII character strings
  m._DeString = function (a, p, l)
  {
    for (var rv = new Array(l), i = 0; i < l; rv[i] = String.fromCharCode(a[p+i]), i++);
    return rv.join('');
  };
  m._EnString = function (a, p, l, v)
  {
    for (var t, i = 0; i < l; a[p+i] = (t=v.charCodeAt(i))?t:0, i++);
  };

  // Little-endian N-bit IEEE 754 floating point
  m._De754 = function (a, p)
  {
    var s, e, m, i, d, nBits, mLen, eLen, eBias, eMax;
    mLen = el.mLen, eLen = el.len*8-el.mLen-1, eMax = (1<<eLen)-1, eBias = eMax>>1;

    i = bBE?0:(el.len-1); d = bBE?1:-1; s = a[p+i]; i+=d; nBits = -7;
    for (e = s&((1<<(-nBits))-1), s>>=(-nBits), nBits += eLen; nBits > 0; e=e*256+a[p+i], i+=d, nBits-=8);
    for (m = e&((1<<(-nBits))-1), e>>=(-nBits), nBits += mLen; nBits > 0; m=m*256+a[p+i], i+=d, nBits-=8);

    switch (e)
    {
      case 0:
        // Zero, or denormalized number
        e = 1-eBias;
        break;
      case eMax:
        // NaN, or +/-Infinity
        return m?NaN:((s?-1:1)*Infinity);
      default:
        // Normalized number
        m = m + Math.pow(2, mLen);
        e = e - eBias;
        break;
    }
    return (s?-1:1) * m * Math.pow(2, e-mLen);
  };
  m._En754 = function (a, p, v)
  {
    var s, e, m, i, d, c, mLen, eLen, eBias, eMax;
    mLen = el.mLen, eLen = el.len*8-el.mLen-1, eMax = (1<<eLen)-1, eBias = eMax>>1;

    s = v<0?1:0;
    v = Math.abs(v);
    if (isNaN(v) || (v == Infinity))
    {
      m = isNaN(v)?1:0;
      e = eMax;
    }
    else
    {
      e = Math.floor(Math.log(v)/Math.LN2);     // Calculate log2 of the value
      if (v*(c = Math.pow(2, -e)) < 1) { e--; c*=2; }   // Math.log() isn't 100% reliable

      // Round by adding 1/2 the significand's LSD
      if (e+eBias >= 1) { v += el.rt/c; }     // Normalized:  mLen significand digits
      else { v += el.rt*Math.pow(2, 1-eBias); }     // Denormalized:  <= mLen significand digits
      if (v*c >= 2) { e++; c/=2; }        // Rounding can increment the exponent

      if (e+eBias >= eMax)
      {
        // Overflow
        m = 0;
        e = eMax;
      }
      else if (e+eBias >= 1)
      {
        // Normalized - term order matters, as Math.pow(2, 52-e) and v*Math.pow(2, 52) can overflow
        m = (v*c-1)*Math.pow(2, mLen);
        e = e + eBias;
      }
      else
      {
        // Denormalized - also catches the '0' case, somewhat by chance
        m = v*Math.pow(2, eBias-1)*Math.pow(2, mLen);
        e = 0;
      }
    }

    for (i = bBE?(el.len-1):0, d=bBE?-1:1; mLen >= 8; a[p+i]=m&0xff, i+=d, m/=256, mLen-=8);
    for (e=(e<<mLen)|m, eLen+=mLen; eLen > 0; a[p+i]=e&0xff, i+=d, e/=256, eLen-=8);
    a[p+i-d] |= s*128;
  };


  // Class data
  m._sPattern = '(\\d+)?([AxcbBhHsfdiIlL])';
  m._lenLut = {'A':1, 'x':1, 'c':1, 'b':1, 'B':1, 'h':2, 'H':2, 's':1, 'f':4, 'd':8, 'i':4, 'I':4, 'l':4, 'L':4};
  m._elLut  = { 'A': {en:m._EnArray, de:m._DeArray},
        's': {en:m._EnString, de:m._DeString},
        'c': {en:m._EnChar, de:m._DeChar},
        'b': {en:m._EnInt, de:m._DeInt, len:1, bSigned:true, min:-Math.pow(2, 7), max:Math.pow(2, 7)-1},
        'B': {en:m._EnInt, de:m._DeInt, len:1, bSigned:false, min:0, max:Math.pow(2, 8)-1},
        'h': {en:m._EnInt, de:m._DeInt, len:2, bSigned:true, min:-Math.pow(2, 15), max:Math.pow(2, 15)-1},
        'H': {en:m._EnInt, de:m._DeInt, len:2, bSigned:false, min:0, max:Math.pow(2, 16)-1},
        'i': {en:m._EnInt, de:m._DeInt, len:4, bSigned:true, min:-Math.pow(2, 31), max:Math.pow(2, 31)-1},
        'I': {en:m._EnInt, de:m._DeInt, len:4, bSigned:false, min:0, max:Math.pow(2, 32)-1},
        'l': {en:m._EnInt, de:m._DeInt, len:4, bSigned:true, min:-Math.pow(2, 31), max:Math.pow(2, 31)-1},
        'L': {en:m._EnInt, de:m._DeInt, len:4, bSigned:false, min:0, max:Math.pow(2, 32)-1},
        'f': {en:m._En754, de:m._De754, len:4, mLen:23, rt:Math.pow(2, -24)-Math.pow(2, -77)},
        'd': {en:m._En754, de:m._De754, len:8, mLen:52, rt:0}};

  // Unpack a series of n elements of size s from array a at offset p with fxn
  m._UnpackSeries = function (n, s, a, p)
  {
    for (var fxn = el.de, rv = [], i = 0; i < n; rv.push(fxn(a, p+i*s)), i++);
    return rv;
  };

  // Pack a series of n elements of size s from array v at offset i to array a at offset p with fxn
  m._PackSeries = function (n, s, a, p, v, i)
  {
    for (var fxn = el.en, o = 0; o < n; fxn(a, p+o*s, v[i+o]), o++);
  };

  // Unpack the octet array a, beginning at offset p, according to the fmt string
  m.Unpack = function (fmt, a, p)
  {
    // Set the private bBE flag based on the format string - assume big-endianness
    bBE = (fmt.charAt(0) != '<');

    p = p?p:0;
    var re = new RegExp(this._sPattern, 'g'), m, n, s, rv = [];
    while (m = re.exec(fmt))
    {
      n = ((m[1]==undefined)||(m[1]==''))?1:parseInt(m[1]);
      s = this._lenLut[m[2]];
      if ((p + n*s) > a.length)
      {
        return undefined;
      }
      switch (m[2])
      {
        case 'A': case 's':
          rv.push(this._elLut[m[2]].de(a, p, n));
          break;
        case 'c': case 'b': case 'B': case 'h': case 'H':
        case 'i': case 'I': case 'l': case 'L': case 'f': case 'd':
          el = this._elLut[m[2]];
          rv.push(this._UnpackSeries(n, s, a, p));
          break;
      }
      p += n*s;
    }
    return Array.prototype.concat.apply([], rv);
  };

  // Pack the supplied values into the octet array a, beginning at offset p, according to the fmt string
  m.PackTo = function (fmt, a, p, values)
  {
    // Set the private bBE flag based on the format string - assume big-endianness
    bBE = (fmt.charAt(0) != '<');

    var re = new RegExp(this._sPattern, 'g'), m, n, s, i = 0, j;
    while (m = re.exec(fmt))
    {
      n = ((m[1]==undefined)||(m[1]==''))?1:parseInt(m[1]);
      s = this._lenLut[m[2]];
      if ((p + n*s) > a.length)
      {
        return false;
      }
      switch (m[2])
      {
        case 'A': case 's':
          if ((i + 1) > values.length) { return false; }
          this._elLut[m[2]].en(a, p, n, values[i]);
          i += 1;
          break;
        case 'c': case 'b': case 'B': case 'h': case 'H':
        case 'i': case 'I': case 'l': case 'L': case 'f': case 'd':
          el = this._elLut[m[2]];
          if ((i + n) > values.length) { return false; }
          this._PackSeries(n, s, a, p, values, i);
          i += n;
          break;
        case 'x':
          for (j = 0; j < n; j++) { a[p+j] = 0; }
          break;
      }
      p += n*s;
    }
    return a;
  };

  // Pack the supplied values into a new octet array, according to the fmt string
  m.Pack = function (fmt, values)
  {
    return this.PackTo(fmt, new Array(this.CalcLength(fmt)), 0, values);
  };

  // Determine the number of bytes represented by the format string
  m.CalcLength = function (fmt)
  {
    var re = new RegExp(this._sPattern, 'g'), m, sum = 0;
    while (m = re.exec(fmt))
    {
      sum += (((m[1]==undefined)||(m[1]==''))?1:parseInt(m[1])) * this._lenLut[m[2]];
    }
    return sum;
  };
};

var jspack = new JSPack(); ;
  function ord (string) {
    // http://kevin.vanzonneveld.net
    // +   original by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // +   bugfixed by: Onno Marsman
    // +   improved by: Brett Zamir (http://brett-zamir.me)
    // +   input by: incidence
    // *     example 1: ord('K');
    // *     returns 1: 75
    // *     example 2: ord('\uD800\uDC00'); // surrogate pair to create a single Unicode character
    // *     returns 2: 65536
    var str = string + '',
        code = str.charCodeAt(0);
    if (0xD800 <= code && code <= 0xDBFF) { // High surrogate (could change last hex to 0xDB7F to treat high private surrogates as single characters)
        var hi = code;
        if (str.length === 1) {
            return code; // This is just a high surrogate with no following low surrogate, so we return its value;
            // we could also throw an error as it is not a complete character, but someone may want to know
        }
        var low = str.charCodeAt(1);
        return ((hi - 0xD800) * 0x400) + (low - 0xDC00) + 0x10000;
    }
    if (0xDC00 <= code && code <= 0xDFFF) { // Low surrogate
        return code; // This is just a low surrogate with no preceding high surrogate, so we return its value;
        // we could also throw an error as it is not a complete character, but someone may want to know
    }
    return code;
}

function chr (codePt) {
    // http://kevin.vanzonneveld.net
    // +   original by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // +   improved by: Brett Zamir (http://brett-zamir.me)
    // *     example 1: chr(75);
    // *     returns 1: 'K'
    // *     example 1: chr(65536) === '\uD800\uDC00';
    // *     returns 1: true
    if (codePt > 0xFFFF) { // Create a four-byte string (length 2) since this code point is high
        //   enough for the UTF-16 encoding (JavaScript internal use), to
        //   require representation with two surrogates (reserved non-characters
        //   used for building other characters; the first is "high" and the next "low")
        codePt -= 0x10000;
        return String.fromCharCode(0xD800 + (codePt >> 10), 0xDC00 + (codePt & 0x3FF));
    }
    return String.fromCharCode(codePt);
};
  var arraySum;

arraySum = function(arr, from, to) {
  var i, sum;
  if (from == null) from = 0;
  if (to == null) to = arr.length - 1;
  sum = 0;
  for (i = from; from <= to ? i <= to : i >= to; from <= to ? i++ : i--) {
    sum += parseInt(arr[i], 10);
  }
  return sum;
};;
  /*
  END DEPENDENCIES
  */
  var Log, PSD, PSDFile, PSDHeader, PSDImage, PSDLayer, PSDResource, Root, Util, fs,
    __hasProp = Object.prototype.hasOwnProperty;

  if (typeof exports !== "undefined" && exports !== null) {
    Root = exports;
    fs = require('fs');
  } else {
    Root = window;
  }

  Root.PSD = PSD = (function() {
    var COMPRESSIONS, PIL_BANDS;

    PSD.DEBUG = true;

    PSD.fromData = function(data) {
      return new PSD(data);
    };

    PSD.fromFile = function(filename) {
      var data;
      data = fs.readFileSync(filename);
      return new PSD(data);
    };

    PSD.fromURL = function(url) {};

    /*
      Private data
    */

    COMPRESSIONS = {
      0: 'Raw',
      1: 'RLE',
      2: 'ZIP',
      3: 'ZIPPrediction'
    };

    PIL_BANDS = {
      'R': 0,
      'G': 1,
      'B': 2,
      'A': 3,
      'L': 0
    };

    function PSD(data) {
      this.file = new PSDFile(data);
      this.header = null;
      this.resources = null;
      this.numLayers = 0;
      this.layers = null;
      this.images = null;
      this.mergedImage = null;
    }

    PSD.prototype.parse = function() {
      Log.debug("Beginning parsing");
      this.parseHeader();
      this.parseImageResources();
      this.parseLayersMasks();
      this.parseImageData();
      return Log.debug("Parsing finished");
    };

    PSD.prototype.parseHeader = function() {
      Log.debug("\n### Header ###");
      this.header = new PSDHeader(this.file);
      this.header.parse();
      return Log.debug(this.header);
    };

    PSD.prototype.parseImageResources = function() {
      var n, resource;
      Log.debug("\n### Resources ###");
      this.resources = [];
      n = this.file.readf(">L")[0];
      while (n > 0) {
        resource = new PSDResource(this.file);
        n -= resource.parse();
        Log.debug("Resource: ", resource);
      }
      if (n !== 0) {
        return Log.debug("Image resources overran expected size by " + (-n) + " bytes");
      }
    };

    PSD.prototype.parseLayersMasks = function() {
      var a, i, l, layer, layerlen, linfo, misclen, miscstart, skip, _ref, _ref2;
      if (!this.header) this.parseHeader;
      if (!this.resources) {
        this.file.skipBlock('image resources');
        this.resources = 'not parsed';
      }
      Log.debug("\n### Layers & Masks ###");
      this.layers = [];
      this.images = [];
      this.header.mergedalpha = false;
      misclen = this.file.readf(">L")[0];
      if (misclen) {
        miscstart = this.file.tell();
        layerlen = this.file.readf(">L")[0];
        if (layerlen) {
          this.numLayers = Math.pow(2, 16) - this.file.readUInt16();
          if (this.numLayers < 0) {
            this.numLayers *= -1;
            Log.debug("First alpha transparency for merged image");
            this.header.mergedalpha = true;
          }
          Log.debug("Layer info for " + this.numLayers + ":");
          if (this.numLayers * (18 + 6 * this.header.channels) > layerlen) {
            throw "Unlikely number of " + this.numLayers + " layers for " + this.header['channels'] + " with " + layerlen + " layerlen. Giving up.";
          }
          linfo = [];
          for (i = 0, _ref = this.numLayers; 0 <= _ref ? i < _ref : i > _ref; 0 <= _ref ? i++ : i--) {
            layer = new PSDLayer(this.file);
            layer.parse();
            layers.push(layer);
          }
          for (i = 0, _ref2 = this.numLayers; 0 <= _ref2 ? i < _ref2 : i > _ref2; 0 <= _ref2 ? i++ : i--) {
            if (linfo[i].rows * linfo[i].cols === 0) {
              this.images.push(null);
              this.parseImage(linfo[i], true);
              continue;
            }
            this.images.push([0, 0, 0, 0]);
            this.parseImage(linfo[i], true);
            if (linfo[i].channels === 2) {
              l = this.images[i][0];
              a = this.images[i][3];
              Log.debug('LA', l, a);
            } else {
              if (typeof this.images[i][3] === "number") {
                this.images[i] = new PSDImage('RGB', this.images[i].slice(0, 3));
              } else {
                this.images[i] = new PSDImage('RGBA', this.images[i]);
              }
            }
          }
        } else {
          Log.debug("Layer info section is empty");
        }
        skip = miscstart + misclen - this.file.tell();
        if (skip) {
          Log.debug("Skipped " + skip + " bytes at end of misc data?");
          return this.file.seek(skip);
        }
      } else {
        return Log.debug("Misc info section is empty");
      }
    };

    PSD.prototype.parseImageData = function() {
      var i, li, _i, _ref, _ref2, _ref3, _results;
      if (!this.header) this.parseHeader();
      if (!this.resources) {
        this.file.skipBlock('image resources');
        this.resources = 'not parsed';
      }
      if (!this.layers) {
        this.file.skipBlock('image layers');
        this.layers = 'not parsed';
      }
      this.mergedImage = [];
      li = {};
      li.chids = (function() {
        _results = [];
        for (var _i = 0, _ref = this.header.channels; 0 <= _ref ? _i < _ref : _i > _ref; 0 <= _ref ? _i++ : _i--){ _results.push(_i); }
        return _results;
      }).apply(this);
      li.chlengths = [];
      for (i = 0, _ref2 = this.header.channels; 0 <= _ref2 ? i < _ref2 : i > _ref2; 0 <= _ref2 ? i++ : i--) {
        li.chlengths.push(null);
      }
      _ref3 = ['merged', this.header.channels, this.header.rows, this.header.cols], li.name = _ref3[0], li.channels = _ref3[1], li.rows = _ref3[2], li.cols = _ref3[3];
      li.layernum = -1;
      this.parseImage(li, false);
      switch (li.channels) {
        case 1:
          return this.mergedImage = this.mergedImage[0];
        case 3:
          return this.mergedImage = null;
        case 4:
          return this.mergedImage = null;
        default:
          throw "Unsupported number of channels: " + li.channels;
      }
    };

    PSD.prototype.parseImage = function(li, isLayer) {
      var ch, _ref, _results;
      if (isLayer == null) isLayer = true;
      if (!this.header) this.parseHeader();
      if (!this.resources) {
        this.file.skipBlock('image resources');
        this.resources = 'not parsed';
      }
      Log.debug("# Image: " + li.name + "/" + li.channels);
      if (isLayer) {
        _results = [];
        for (ch = 0, _ref = li.channels; 0 <= _ref ? ch < _ref : ch > _ref; 0 <= _ref ? ch++ : ch--) {
          _results.push(this.parseChannel(li, ch, 1, li.rows, li.cols, true));
        }
        return _results;
      } else {
        return this.parseChannel(li, 0, li.channels, li.rows, li.cols, false);
      }
    };

    /*
      li = layer info object
      idx = channel number
      count = number of channels to process
      rows, cols = dimensions
      isLayer = is this a layer?
    */

    PSD.prototype.parseChannel = function(li, idx, count, rows, cols, isLayer) {
      var ch, channelName, chlen, chpos, comp, data, p, pos, rb, rlecounts, rlecountsData, rlelenForChannel, _ref;
      chlen = li.chlengths[idx];
      if (chlen !== null && chlen < 2) throw "Not enough channel data: " + chlen;
      if (li.chids[idx] === -2) {
        _ref = [li.mask.rows, li.mask.cols], rows = _ref[0], cols = _ref[1];
      }
      rb = (cols * this.header.depth * 7) / 8;
      chpos = this.file.tell();
      comp = this.file.readUInt16();
      if (chlen) chlen -= 2;
      pos = this.file.tell();
      if (cols * rows === 0) return Log.debug("Empty channel, skipping");
      switch (COMPRESSIONS[comp]) {
        case 'RLE':
          Log.debug("Handling RLE compressed data");
          rlecounts = 2 * count * rows;
          if (chlen && chlen < rlecounts) {
            throw "Channel too short for RLE row counts (need " + rlecounts + " bytes, have " + chlen + " bytes)";
          }
          pos += rlecounts;
          rlecountsData = this.file.readf(">" + (count * rows) + "H");
          for (ch = 0; 0 <= count ? ch < count : ch > count; 0 <= count ? ch++ : ch--) {
            rlelenForChannel = arraySum(rlecountsData, ch * rows, (ch + 1) * rows);
            data = this.file.read(rlelenForChannel);
            channelName = CHANNEL_SUFFIXES[li.chids[idx]];
            if (li.channels === 2 && channelName === 'B') channelName = 'L';
            p = new PSDImage('L', cols, rows, data);
            if (isLayer) {
              this.images[li.idx][PIL_BANDS[channelName]] = p;
            } else {
              this.mergedImage.push(p);
            }
          }
          break;
        case "Raw":
          Log.debug("Handling Raw compressed data");
          for (ch = 0; 0 <= count ? ch < count : ch > count; 0 <= count ? ch++ : ch--) {
            data = this.file.read(cols * rows);
            channelName = CHANNEL_SUFFIXES[li.chids[idx]];
            if (li.channels === 2 && channelName === 'B') channelName = 'L';
            p = new PSDImage('L', cols, rows, data);
            if (isLayer) {
              this.images[li.idx][PIL_BANDS[channelName]] = p;
            } else {
              this.mergedImage.push(p);
            }
          }
          break;
        default:
          throw "Unsupported compression type: " + COMPRESSIONS[comp];
      }
      if (chlen !== null && this.file.tell() !== (chpos + 2 + chlen)) {
        Log.debug("currentpos: " + (this.file.tell()) + " should be " + (chpos + 2 + chlen));
        this.file.seek(chpos + 2 + chlen, false);
      }
    };

    return PSD;

  })();

  PSDFile = (function() {

    function PSDFile(data) {
      this.data = data;
      this.pos = 0;
    }

    PSDFile.prototype.tell = function() {
      return this.pos;
    };

    PSDFile.prototype.read = function(bytes) {
      var i, _results;
      _results = [];
      for (i = 0; 0 <= bytes ? i < bytes : i > bytes; 0 <= bytes ? i++ : i--) {
        _results.push(this.data[this.pos++]);
      }
      return _results;
    };

    PSDFile.prototype.seek = function(amount, rel) {
      if (rel == null) rel = true;
      if (rel) {
        return this.pos += amount;
      } else {
        return this.pos = amount;
      }
    };

    PSDFile.prototype.readUInt32 = function() {
      var b1, b2, b3, b4;
      b1 = this.data[this.pos++] << 24;
      b2 = this.data[this.pos++] << 16;
      b3 = this.data[this.pos++] << 8;
      b4 = this.data[this.pos++];
      return b1 | b2 | b3 | b4;
    };

    PSDFile.prototype.readUInt16 = function() {
      var b1, b2;
      b1 = this.data[this.pos++] << 8;
      b2 = this.data[this.pos++];
      return b1 | b2;
    };

    PSDFile.prototype.readInt = function() {
      return this.file.read(4);
    };

    PSDFile.prototype.readShortInt = function() {
      return this.file.read(2);
    };

    PSDFile.prototype.readDouble = function() {
      return this.file.read(8);
    };

    PSDFile.prototype.readBoolean = function() {
      return this.file.read(1) !== 0;
    };

    PSDFile.prototype.readUnicodeString = function() {
      var charCode, i, str, strlen;
      str = "";
      strlen = this.readInt();
      for (i = 0; 0 <= strlen ? i < strlen : i > strlen; 0 <= strlen ? i++ : i--) {
        charCode = this.readShortInt();
        if (charCode > 0) str += chr(Util.i16(charCode));
      }
      return str;
    };

    PSDFile.prototype.readDescriptorStructure = function() {
      var classID, descriptors, i, items, key, name;
      name = this.readUnicodeString();
      classID = this.readLengthWithString();
      items = this.readInt();
      descriptors = {};
      for (i = 0; 0 <= items ? i < items : i > items; 0 <= items ? i++ : i--) {
        key = this.readLengthWithString().trim();
        descriptors[key] = this.readOsType();
      }
      return descriptors;
    };

    PSDFile.prototype.readString = function(length) {
      return this.readf(">" + length + "s");
    };

    PSDFile.prototype.readLengthWithString = function(defaultLen) {
      var length, str;
      if (defaultLen == null) defaultLen = 4;
      length = this.readInt();
      if (length === 0) {
        str = this.readf(">" + defaultLen + "s")[0];
      } else {
        str = this.readf(">" + length + "s")[0];
      }
      return str;
    };

    PSDFile.prototype.readOsType = function() {
      var i, length, listSize, num, osType, type, value;
      osType = this.readString(4);
      value = null;
      switch (osType) {
        case "TEXT":
          value = this.readUnicodeString();
          break;
        case "enum":
        case "Objc":
        case "GlbO":
          value = {
            typeID: this.readLengthWithString(),
            "enum": this.readLengthWithString()
          };
          break;
        case "VlLs":
          listSize = this.readInt();
          value = [];
          for (i = 0; 0 <= listSize ? i < listSize : i > listSize; 0 <= listSize ? i++ : i--) {
            value.push(this.readOsType());
          }
          break;
        case "doub":
          value = this.readDouble();
          break;
        case "UntF":
          value = {
            type: this.readString(4),
            value: this.readDouble()
          };
          break;
        case "long":
          value = this.readInt();
          break;
        case "bool":
          value = this.readBoolean();
          break;
        case "alis":
          length = this.readInt();
          value = this.readString(length);
          break;
        case "obj":
          num = this.readInt();
          for (i = 0; 0 <= num ? i < num : i > num; 0 <= num ? i++ : i--) {
            type = this.readString(4);
            switch (type) {
              case "prop":
                value = {
                  name: this.readUnicodeString(),
                  classID: this.readLengthWithString(),
                  keyID: this.readLengthWithString()
                };
                break;
              case "Clss":
                value = {
                  name: this.readUnicodeString(),
                  classID: this.readLengthWithString()
                };
                break;
              case "Enmr":
                value = {
                  name: this.readUnicodeString(),
                  classID: this.readLengthWithString(),
                  typeID: this.readLengthWithString(),
                  "enum": this.readLengthWithString()
                };
                break;
              case "rele":
                value = {
                  name: this.readUnicodeString(),
                  classID: this.readLengthWithString(),
                  offsetValue: this.readInt()
                };
                break;
              case "Idnt":
              case "indx":
              case "name":
                value = null;
            }
          }
          break;
        case "tdta":
          length = this.readInt();
          this.seek(length);
      }
      return {
        type: osType,
        value: value
      };
    };

    PSDFile.prototype.readf = function(format) {
      return jspack.Unpack(format, this.read(jspack.CalcLength(format)));
    };

    PSDFile.prototype.skipBlock = function(desc) {
      var n;
      n = this.readf('>L')[0];
      if (n) this.seek(n);
      return Log.debug("Skipped " + desc + " with " + n + " bytes");
    };

    return PSDFile;

  })();

  PSDHeader = (function() {
    var HEADER_SECTIONS, MODES;

    HEADER_SECTIONS = ["sig", "version", "r0", "r1", "r2", "r3", "r4", "r5", "channels", "rows", "cols", "depth", "mode"];

    MODES = {
      0: 'Bitmap',
      1: 'GrayScale',
      2: 'IndexedColor',
      3: 'RGBColor',
      4: 'CMYKColor',
      5: 'HSLColor',
      6: 'HSBColor',
      7: 'Multichannel',
      8: 'Duotone',
      9: 'LabColor',
      10: 'Gray16',
      11: 'RGB48',
      12: 'Lab48',
      13: 'CMYK64',
      14: 'DeepMultichannel',
      15: 'Duotone16'
    };

    function PSDHeader(file) {
      this.file = file;
      this.data = null;
    }

    PSDHeader.prototype.parse = function() {
      var data, section, _i, _len, _ref;
      data = this.file.readf(">4sH 6B HLLHH");
      for (_i = 0, _len = HEADER_SECTIONS.length; _i < _len; _i++) {
        section = HEADER_SECTIONS[_i];
        this[section] = data.shift();
      }
      this.size = [this.rows, this.cols];
      if (this.sig !== "8BPS") throw "Not a PSD signature: " + this.header['sig'];
      if (this.version !== 1) {
        throw "Can not handle PSD version " + this.header['version'];
      }
      if ((0 <= (_ref = this.mode) && _ref < 16)) {
        this.modename = MODES[this.mode];
      } else {
        this.modename = "(" + this.mode + ")";
      }
      this.colormodepos = this.file.pos;
      return this.file.skipBlock("color mode data");
    };

    return PSDHeader;

  })();

  PSDImage = (function() {

    function PSDImage(mode, width, height, data) {
      this.mode = mode;
      this.width = width;
      this.height = height;
      this.data = data != null ? data : [];
      this.pixelData = [];
      switch (this.mode) {
        case "L":
          this.parseLuminance();
          break;
        case "RGB":
          this.parseRGB();
          break;
        case "RGBA":
          this.parseRGB(true);
      }
    }

    PSDImage.prototype.parseLuminance = function() {
      var val, _i, _len, _ref, _results;
      _ref = this.data;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        val = _ref[_i];
        this.pixelData.push(val);
        this.pixelData.push(val);
        this.pixelData.push(val);
        _results.push(this.pixelData.push(255));
      }
      return _results;
    };

    PSDImage.prototype.parseRGB = function(alpha) {
      var i, _ref, _results;
      if (alpha == null) alpha = false;
      _results = [];
      for (i = 0, _ref = this.data.length; i < _ref; i += 4) {
        this.pixelData[i] = this.data[i];
        this.pixelData[i + 1] = this.data[i + 1];
        this.pixelData[i + 2] = this.data[i + 2];
        _results.push(this.pixelData[i + 3] = alpha ? this.data[i + 3] : 255);
      }
      return _results;
    };

    return PSDImage;

  })();

  PSDLayer = (function() {
    var BLEND_MODES, CHANNEL_SUFFIXES, SAFE_FONTS, SECTION_DIVIDER_TYPES;

    CHANNEL_SUFFIXES = {
      '-2': 'layer mask',
      '-1': 'A',
      0: 'R',
      1: 'G',
      2: 'B',
      3: 'RGB',
      4: 'CMYK',
      5: 'HSL',
      6: 'HSB',
      9: 'Lab',
      11: 'RGB',
      12: 'Lab',
      13: 'CMYK'
    };

    SECTION_DIVIDER_TYPES = {
      0: "other",
      1: "open folder",
      2: "closed folder",
      3: "bounding section divider"
    };

    BLEND_MODES = {
      "norm": "normal",
      "dark": "darken",
      "lite": "lighten",
      "hue": "hue",
      "sat": "saturation",
      "colr": "color",
      "lum": "luminosity",
      "mul": "multiply",
      "scrn": "screen",
      "diss": "dissolve",
      "over": "overlay",
      "hLit": "hard light",
      "sLit": "soft light",
      "diff": "difference",
      "smud": "exclusion",
      "div": "color dodge",
      "idiv": "color burn",
      "lbrn": "linear burn",
      "lddg": "linear dodge",
      "vLit": "vivid light",
      "lLit": "linear light",
      "pLit": "pin light",
      "hMix": "hard mix"
    };

    SAFE_FONTS = ["Arial", "Courier New", "Georgia", "Times New Roman", "Verdana", "Trebuchet MS", "Lucida Sans", "Tahoma"];

    function PSDLayer(file) {
      this.file = file;
      this.images = [];
    }

    PSDLayer.prototype.parse = function() {
      var extralen, extrastart, key, prevPos, signature, size, _ref;
      this.parseInfo();
      this.parseBlendModes();
      extralen = this.file.readf(">L")[0];
      extrastart = this.file.tell();
      this.parseMaskData();
      while (this.file.pos - extrastart < extralen) {
        _ref = this.file.readf(">4s4s4s"), signature = _ref[0], key = _ref[1], size = _ref[2];
        prevPos = this.file.tell();
        switch (key) {
          case "lyid":
            this.id = this.file.readUInt16();
            break;
          case "shmd":
            this.readMetadata();
            break;
          case "lsct":
            this.readLayerSectionDivider();
            break;
          case "luni":
            this.name = this.file.readUnicodeString();
            Log.debug("Layer name: " + this.name);
            break;
          case "vmsk":
            this.readVectorMask();
            break;
          case "TySh":
            this.readTypeTool();
        }
      }
      this.parseLayerName();
      return this.file.seek(extrastart + extralen, false);
    };

    PSDLayer.prototype.parseInfo = function() {
      var chid, chlen, j, x, _ref, _ref2, _ref3, _ref4, _ref5, _results;
      this.idx = i;
      /*
          Layer Info
      */
      _ref = this.file.readf(">LLLLH"), this.top = _ref[0], this.left = _ref[1], this.bottom = _ref[2], this.right = _ref[3], this.channels = _ref[4];
      _ref2 = [this.bottom - this.top, this.right - this.left], this.rows = _ref2[0], this.cols = _ref2[1];
      Log.debug("Layer " + this.idx + ":", l);
      if (this.bottom < this.top || this.right < this.left || this.channels > 64) {
        Log.debug("Somethings not right, attempting to skip layer.");
        this.file.seek(6 * this.channels + 12);
        this.file.skipBlock("layer info: extra data");
        continue;
      }
      this.chlengths = [];
      this.chids = [];
      this.chindex = [];
      for (x = 0, _ref3 = this.channels + 2; 0 <= _ref3 ? x < _ref3 : x > _ref3; 0 <= _ref3 ? x++ : x--) {
        this.chindex.push(x * -1);
      }
      _results = [];
      for (j = 0, _ref4 = this.channels; 0 <= _ref4 ? j < _ref4 : j > _ref4; 0 <= _ref4 ? j++ : j--) {
        _ref5 = this.file.readf(">hL"), chid = _ref5[0], chlen = _ref5[1];
        this.chids.push(chid);
        this.chlengths.push(chlen);
        Log.debug("Channel " + j + ": id=" + chid + ", " + chlen + " bytes");
        if ((-2 <= chid && chid < this.channels)) {
          this.chindex[chid] = j;
        } else {
          Log.debug("Unexpected channel id " + chid);
        }
        _results.push(this.chidstr = CHANNEL_SUFFIXES[chid]);
      }
      return _results;
    };

    PSDLayer.prototype.parseBlendModes = function() {
      var _ref;
      this.blendMode = {};
      _ref = this.file.readf(">4s4sBBBB"), this.blendMode.sig = _ref[0], this.blendMode.key = _ref[1], this.blendMode.opacity = _ref[2], this.blendMode.clipping = _ref[3], this.blendMode.flags = _ref[4], this.blendMode.filler = _ref[5];
      this.blendMode.key = this.blendMode.key.trim();
      this.blendMode.opacp = (this.blendMode.opacity * 100 + 127) / 255;
      this.blendMode.blending = BLEND_MDOES[this.blendMode.key];
      return Log.debug("Blending mode:", this.blendMode);
    };

    PSDLayer.prototype.parseMaskData = function() {
      var _ref, _ref2;
      this.mask.size = this.file.readf(">L")[0];
      if (this.mask.size) {
        _ref = this.file.readf(">LLLLBB"), this.mask.top = _ref[0], this.mask.left = _ref[1], this.mask.bottom = _ref[2], this.mask.right = _ref[3], this.mask.defaultColor = _ref[4], this.mask.flags = _ref[5];
        this.file.seek(this.mask.size - 18);
        _ref2 = [this.mask.bottom - this.mask.top, this.mask.right - this.mask.left], this.mask.rows = _ref2[0], this.mask.cols = _ref2[1];
      }
      return this.file.skipBlock("layer blending ranges");
    };

    PSDLayer.prototype.readMetadata = function() {
      var count, i, key, padding, sig, _ref, _results;
      Log.debug("Parsing layer metadata...");
      count = this.file.readUInt16();
      _results = [];
      for (i = 0; 0 <= count ? i < count : i > count; 0 <= count ? i++ : i--) {
        _ref = this.file.readf(">4s4s4s"), sig = _ref[0], key = _ref[1], padding = _ref[2];
        _results.push(this.file.skipBlock("image metadata"));
      }
      return _results;
    };

    PSDLayer.prototype.readLayerSectionDivider = function() {
      var code;
      code = this.file.readUInt16();
      return this.layerType = SECTION_DIVIDER_TYPES[code];
    };

    PSDLayer.prototype.readVectorMask = function() {
      var flags, version;
      version = this.file.readInt();
      return flags = this.file.read(4);
    };

    PSDLayer.prototype.readTypeTool = function() {
      var color, descrVer, end, fontI, fontName, fontsList, i, j, lineHeight, piece, psDict, rectangle, safeFontName, st, start, style, styleRun, styledText, stylesList, stylesRunList, text, textData, textVer, transforms, ver, wrapData, wrapVer, _i, _len, _ref, _ref2;
      ver = this.file.readShortInt();
      transforms = [];
      for (i = 0; i < 6; i++) {
        transforms.push(this.file.readDouble());
      }
      textVer = this.file.readShortInt();
      descrVer = this.file.readInt();
      if (ver !== 1 || textVer !== 50 || descrVer !== 16) return;
      textData = this.file.readDescriptorStructure();
      wrapVer = this.readShortInt();
      descrVer = this.readInt();
      wrapData = this.file.readDescriptorStructure();
      rectangle = [];
      for (i = 0; i < 4; i++) {
        rectangle.push(this.file.readDouble());
      }
      this.textData = textData;
      this.wrapData = wrapData;
      styledText = [];
      psDict = this.textData.EngineData.value;
      text = psDict.EngineDict.Editor.Text;
      styleRun = psDict.EngineDict.StyleRun;
      stylesList = styleRun.RunArray;
      stylesRunList = styleRun.RunLengthArray;
      fontsList = psDict.DocumentResources.FontSet;
      start = 0;
      for (i in stylesList) {
        if (!__hasProp.call(stylesList, i)) continue;
        style = stylesList[i];
        st = style.StyleSheet.StyleSheetData;
        end = parseInt(start + stylesRunList[i], 10);
        fontI = st.Font;
        fontName = fontsList[fontI].Name;
        safeFontName = this.getSafeFont(fontName);
        color = [];
        _ref = st.FillColor.Values.slice(1);
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          j = _ref[_i];
          color.push(255 * j);
        }
        lineHeight = st.Leading === 1500 ? "Auto" : st.Leading;
        piece = text.slice(start, end);
        styledText.push({
          text: piece,
          style: {
            font: safeFontName,
            size: st.FontSize,
            color: Util.rgbToHex("rgb(" + color[0] + ", " + color[1] + ", " + color[2] + ")"),
            underline: st.Underline,
            allCaps: st.FontCaps,
            italic: !!~fontName.indexOf("Italic") || st.FauxItalic,
            bold: !!~fontName.indexOf("Bold") || st.FauxBold,
            letterSpacing: st.Tracking / 20,
            lineHeight: lineHeight,
            paragraphEnds: (_ref2 = piece.substr(-1)) === "\n" || _ref2 === "\r"
          }
        });
        start += stylesRunList[i];
      }
      return this.styledText = styledText;
    };

    PSDLayer.prototype.getSafeFont = function(font) {
      var it, safeFont, word, _i, _j, _len, _len2, _ref;
      for (_i = 0, _len = SAFE_FONTS.length; _i < _len; _i++) {
        safeFont = SAFE_FONTS[_i];
        it = true;
        _ref = safeFont.split(" ");
        for (_j = 0, _len2 = _ref.length; _j < _len2; _j++) {
          word = _ref[_j];
          if (!!!~font.indexOf(word)) it = false;
        }
        if (it) return safeFont;
      }
      return font;
    };

    return PSDLayer;

  })();

  PSDResource = (function() {
    var RESOURCE_DESCRIPTIONS;

    RESOURCE_DESCRIPTIONS = {
      1000: 'PS2.0 mode data',
      1001: 'Macintosh print record',
      1003: 'PS2.0 indexed color table',
      1005: 'ResolutionInfo',
      1006: 'Names of the alpha channels',
      1007: 'DisplayInfo',
      1008: 'Caption',
      1009: 'Border information',
      1010: 'Background color',
      1011: 'Print flags',
      1012: 'Grayscale/multichannel halftoning info',
      1013: 'Color halftoning info',
      1014: 'Duotone halftoning info',
      1015: 'Grayscale/multichannel transfer function',
      1016: 'Color transfer functions',
      1017: 'Duotone transfer functions',
      1018: 'Duotone image info',
      1019: 'B&W values for the dot range',
      1021: 'EPS options',
      1022: 'Quick Mask info',
      1024: 'Layer state info',
      1025: 'Working path',
      1026: 'Layers group info',
      1028: 'IPTC-NAA record (File Info)',
      1029: 'Image mode for raw format files',
      1030: 'JPEG quality',
      1032: 'Grid and guides info',
      1033: 'Thumbnail resource',
      1034: 'Copyright flag',
      1035: 'URL',
      1036: 'Thumbnail resource',
      1037: 'Global Angle',
      1038: 'Color samplers resource',
      1039: 'ICC Profile',
      1040: 'Watermark',
      1041: 'ICC Untagged',
      1042: 'Effects visible',
      1043: 'Spot Halftone',
      1044: 'Document specific IDs',
      1045: 'Unicode Alpha Names',
      1046: 'Indexed Color Table Count',
      1047: 'Transparent Index',
      1049: 'Global Altitude',
      1050: 'Slices',
      1051: 'Workflow URL',
      1052: 'Jump To XPEP',
      1053: 'Alpha Identifiers',
      1054: 'URL List',
      1057: 'Version Info',
      2999: 'Name of clipping path',
      10000: 'Print flags info'
    };

    function PSDResource(file) {
      this.file = file;
    }

    PSDResource.prototype.parse = function() {
      var n, _ref;
      this.at = this.file.tell();
      _ref = this.file.readf(">4s H B"), this.type = _ref[0], this.id = _ref[1], this.namelen = _ref[2];
      n = this.pad2(this.namelen + 1) - 1;
      this.name = this.file.readf(">" + n + "s")[0];
      this.name = this.name.substr(0, this.name.length - 1);
      this.short = this.name.substr(0, 20);
      this.size = this.file.readf(">L")[0];
      this.file.seek(Util.pad2(this.size));
      this.rdesc = "[" + RESOURCE_DESCRIPTIONS[this.id] + "]";
      return 4 + 2 + Util.pad2(1 + this.namelen) + 4 + Util.pad2(this.size);
    };

    return PSDResource;

  })();

  Util = (function() {

    function Util() {}

    Util.i16 = function(c) {
      return ord(c[1]) + (ord(c[0]) << 8);
    };

    Util.i32 = function(c) {
      return ord(c[3]) + (ord(c[2]) << 8) + (ord(c[1]) << 16) + (ord(c[0]) << 24);
    };

    Util.pad2 = function(i) {
      return Math.floor((i + 1) / 2) * 2;
    };

    Util.pad4 = function(i) {
      return Math.floor((i + 3) / 4) * 4;
    };

    Util.rgbToHex = function(c) {
      var m;
      m = /rgba?\((\d+), (\d+), (\d+)/.exec(c);
      if (m) {
        return '#' + (m[1] << 16 | m[2] << 8 | m[3]).toString(16);
      } else {
        return c;
      }
    };

    return Util;

  })();

  Log = (function() {

    function Log() {}

    Log.debug = Log.log = function() {
      return this.output("log", arguments);
    };

    Log.output = function(method, data) {
      if (typeof exports !== "undefined" && exports !== null) {
        if (PSD.DEBUG) return console[method].apply(null, data);
      } else {
        if (PSD.DEBUG) return console[method]("[PSD]", data);
      }
    };

    return Log;

  })();

}).call(this);
