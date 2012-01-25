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
  var Log, PSD, Root, fs;

  if (typeof exports !== "undefined" && exports !== null) {
    Root = exports;
    fs = require('fs');
  } else {
    Root = window;
  }

  Root.PSD = PSD = (function() {
    var BLENDINGS, CHANNEL_SUFFIXES, COMPRESSIONS, HEADER_SECTIONS, MODES, PIL_BANDS, RESOURCE_DESCRIPTIONS;

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

    HEADER_SECTIONS = ["sig", "version", "r0", "r1", "r2", "r3", "r4", "r5", "channels", "rows", "cols", "depth", "mode"];

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

    COMPRESSIONS = {
      0: 'Raw',
      1: 'RLE',
      2: 'ZIP',
      3: 'ZIPPrediction'
    };

    BLENDINGS = {
      'norm': 'normal',
      'dark': 'darken',
      'mul ': 'multiply',
      'lite': 'lighten',
      'scrn': 'screen',
      'over': 'overlay',
      'sLit': 'soft-light',
      'hLit': 'hard-light',
      'lLit': 'linear-light',
      'diff': 'difference',
      'smud': 'exclusion'
    };

    PIL_BANDS = {
      'R': 0,
      'G': 1,
      'B': 2,
      'A': 3,
      'L': 0
    };

    function PSD(data) {
      this.data = data;
      this.pos = 0;
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
      var data, section, _i, _len, _ref;
      Log.debug("\n### Header ###");
      this.header = {};
      data = this.readf(">4sH 6B HLLHH");
      for (_i = 0, _len = HEADER_SECTIONS.length; _i < _len; _i++) {
        section = HEADER_SECTIONS[_i];
        this.header[section] = data.shift();
      }
      this.size = [this.header['rows'], this.header['cols']];
      if (this.header['sig'] !== "8BPS") {
        throw "Not a PSD signature: " + this.header['sig'];
      }
      if (this.header['version'] !== 1) {
        throw "Can not handle PSD version " + this.header['version'];
      }
      if ((0 <= (_ref = this.header['mode']) && _ref < 16)) {
        this.header['modename'] = MODES[this.header['mode']];
      } else {
        this.header['modename'] = "(" + this.header['mode'] + ")";
      }
      Log.debug(this.header);
      this.header['colormodepos'] = this.pos;
      return this.skipBlock("color mode data");
    };

    PSD.prototype.parseImageResources = function() {
      var n;
      Log.debug("\n### Resources ###");
      this.resources = [];
      n = this.readf(">L")[0];
      while (n > 0) {
        n -= this.parseIrb();
      }
      if (n !== 0) {
        return Log.debug("Image resources overran expected size by " + (-n) + " bytes");
      }
    };

    PSD.prototype.parseLayersMasks = function() {
      var a, bm, chid, chlen, count, extralen, extrastart, i, j, key, l, layerlen, linfo, m, misclen, miscstart, namelen, signature, size, skip, x, _ref, _ref10, _ref11, _ref12, _ref2, _ref3, _ref4, _ref5, _ref6, _ref7, _ref8, _ref9;
      if (!this.header) this.parseHeader;
      if (!this.resources) {
        this.skipBlock('image resources');
        this.resources = 'not parsed';
      }
      Log.debug("\n### Layers & Masks ###");
      this.layers = [];
      this.images = [];
      this.header.mergedalpha = false;
      misclen = this.readf(">L")[0];
      if (misclen) {
        miscstart = this.tell();
        layerlen = this.readf(">L")[0];
        if (layerlen) {
          this.numLayers = Math.pow(2, 16) - this.readUInt16();
          if (this.numLayers < 0) {
            this.numLayers *= -1;
            Log.debug("First alpha transparency for merged image");
            this.header.mergedalpha = true;
          }
          Log.debug("Layer info for " + this.numLayers + ":");
          if (this.numLayers * (18 + 6 * this.header['channels']) > layerlen) {
            throw "Unlikely number of " + this.numLayers + " layers for " + this.header['channels'] + " with " + layerlen + " layerlen. Giving up.";
          }
          linfo = [];
          for (i = 0, _ref = this.numLayers; 0 <= _ref ? i < _ref : i > _ref; 0 <= _ref ? i++ : i--) {
            l = {};
            l.idx = i;
            /*
                      Layer Info
            */
            _ref2 = this.readf(">LLLLH"), l.top = _ref2[0], l.left = _ref2[1], l.bottom = _ref2[2], l.right = _ref2[3], l.channels = _ref2[4];
            _ref3 = [l.bottom - l.top, l.right - l.left], l.rows = _ref3[0], l.cols = _ref3[1];
            Log.debug("Layer " + l.idx + ":", l);
            if (l.bottom < l.top || l.right < l.left || l.channels > 64) {
              Log.debug("Somethings not right, attempting to skip layer.");
              this.seek(6 * l.channels + 12);
              this.skipBlock("layer info: extra data");
              continue;
            }
            l.chlengths = [];
            l.chids = [];
            l.chindex = [];
            for (x = 0, _ref4 = l.channels + 2; 0 <= _ref4 ? x < _ref4 : x > _ref4; 0 <= _ref4 ? x++ : x--) {
              l.chindex.push(x * -1);
            }
            for (j = 0, _ref5 = l.channels; 0 <= _ref5 ? j < _ref5 : j > _ref5; 0 <= _ref5 ? j++ : j--) {
              _ref6 = this.readf(">hL"), chid = _ref6[0], chlen = _ref6[1];
              l.chids.push(chid);
              l.chlengths.push(chlen);
              Log.debug("Channel " + j + ": id=" + chid + ", " + chlen + " bytes");
              if ((-2 <= chid && chid < l.channels)) {
                l.chindex[chid] = j;
              } else {
                Log.debug("Unexpected channel id " + chid);
              }
              l.chidstr = CHANNEL_SUFFIXES[chid];
            }
            linfo.push(l);
            /*
                      Blend mode
            */
            bm = {};
            _ref7 = this.readf(">4s4sBBBB"), bm.sig = _ref7[0], bm.key = _ref7[1], bm.opacity = _ref7[2], bm.clipping = _ref7[3], bm.flags = _ref7[4], bm.filler = _ref7[5];
            bm.opacp = (bm.opacity * 100 + 127) / 255;
            bm.blending = BLENDINGS[bm.key];
            l.blend_mode = bm;
            Log.debug("Blending mode:", bm);
            extralen = this.readf(">L")[0];
            extrastart = this.tell();
            /*
                      Layer mask data
            */
            m = {};
            m.size = this.readf(">L")[0];
            if (m.size) {
              _ref8 = this.readf(">LLLLBB"), m.top = _ref8[0], m.left = _ref8[1], m.bottom = _ref8[2], m.right = _ref8[3], m.default_color = _ref8[4], m.flags = _ref8[5];
              this.seek(m.size - 18);
              _ref9 = [m.bottom - m.top, m.right - m.left], m.rows = _ref9[0], m.cols = _ref9[1];
            }
            l.mask = m;
            this.skipBlock("layer blending ranges");
            /*
                      Layer name
            */
            l.namelen = this.readf(">B")[0];
            l.name = this.readf(">" + l.namelen + "s")[0];
            _ref10 = this.readf(">4s4s4s"), signature = _ref10[0], key = _ref10[1], size = _ref10[2];
            if (key === "luni") {
              namelen = this.i32(this.read(4));
              namelen += namelen % 2;
              l.name = "";
              for (count = 0, _ref11 = namelen - 1; 0 <= _ref11 ? count < _ref11 : count > _ref11; 0 <= _ref11 ? count++ : count--) {
                l.name += chr(this.i16(this.read(2)));
              }
            }
            Log.debug("Layer name: " + l.name);
            this.seek(extrastart + extralen, false);
            this.layers.push(l);
          }
          for (i = 0, _ref12 = this.numLayers; 0 <= _ref12 ? i < _ref12 : i > _ref12; 0 <= _ref12 ? i++ : i--) {
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
                Log.debug("RGB", this.images[i].slice(0, 3));
              } else {
                Log.debug("RGBA", this.images[i]);
              }
            }
          }
        } else {
          Log.debug("Layer info section is empty");
        }
        skip = miscstart + misclen - this.tell();
        if (skip) {
          Log.debug("Skipped " + skip + " bytes at end of misc data?");
          return this.seek(skip);
        }
      } else {
        return Log.debug("Misc info section is empty");
      }
    };

    PSD.prototype.parseImageData = function() {
      var i, li, _i, _ref, _ref2, _ref3, _results;
      if (!this.header) this.parseHeader();
      if (!this.resources) {
        this.skipBlock('image resources');
        this.resources = 'not parsed';
      }
      if (!this.layers) {
        this.skipBlock('image layers');
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
        default:
          throw "Unsupported number of channels";
      }
    };

    PSD.prototype.parseImage = function(li, isLayer) {
      var ch, _ref, _results;
      if (isLayer == null) isLayer = true;
      if (!this.header) this.parseHeader();
      if (!this.resources) {
        this.skipBlock('image resources');
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
      chpos = this.tell();
      comp = this.readUInt16();
      if (chlen) chlen -= 2;
      pos = this.tell();
      if (cols * rows === 0) return Log.debug("Empty channel, skipping");
      switch (COMPRESSIONS[comp]) {
        case 'RLE':
          Log.debug("Handling RLE compressed data");
          rlecounts = 2 * count * rows;
          if (chlen && chlen < rlecounts) {
            throw "Channel too short for RLE row counts (need " + rlecounts + " bytes, have " + chlen + " bytes)";
          }
          pos += rlecounts;
          rlecountsData = this.readf(">" + (count * rows) + "H");
          for (ch = 0; 0 <= count ? ch < count : ch > count; 0 <= count ? ch++ : ch--) {
            rlelenForChannel = arraySum(rlecountsData, ch * rows, (ch + 1) * rows);
            data = this.read(rlelenForChannel);
            channelName = CHANNEL_SUFFIXES[li.chids[idx]];
            if (li.channels === 2 && channelName === 'B') channelName = 'L';
            p = null;
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
            data = this.read(cols * rows);
            channelName = CHANNEL_SUFFIXES[li.chids[idx]];
            if (li.channels === 2 && channelName === 'B') channelName = 'L';
            p = null;
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
      if (chlen !== null && this.tell() !== (chpos + 2 + chlen)) {
        Log.debug("currentpos: " + (this.tell()) + " should be " + (chpos + 2 + chlen));
        this.seek(chpos + 2 + chlen, false);
      }
    };

    /*
      Utility functions
    */

    PSD.prototype.tell = function() {
      return this.pos;
    };

    PSD.prototype.read = function(bytes) {
      var i, _results;
      _results = [];
      for (i = 0; 0 <= bytes ? i < bytes : i > bytes; 0 <= bytes ? i++ : i--) {
        _results.push(this.data[this.pos++]);
      }
      return _results;
    };

    PSD.prototype.seek = function(amount, rel) {
      if (rel == null) rel = true;
      if (rel) {
        return this.pos += amount;
      } else {
        return this.pos = amount;
      }
    };

    PSD.prototype.readUInt32 = function() {
      var b1, b2, b3, b4;
      b1 = this.data[this.pos++] << 24;
      b2 = this.data[this.pos++] << 16;
      b3 = this.data[this.pos++] << 8;
      b4 = this.data[this.pos++];
      return b1 | b2 | b3 | b4;
    };

    PSD.prototype.readUInt16 = function() {
      var b1, b2;
      b1 = this.data[this.pos++] << 8;
      b2 = this.data[this.pos++];
      return b1 | b2;
    };

    PSD.prototype.i16 = function(c) {
      return ord(c[1]) + (ord(c[0]) << 8);
    };

    PSD.prototype.i32 = function(c) {
      return ord(c[3]) + (ord(c[2]) << 8) + (ord(c[1]) << 16) + (ord(c[0]) << 24);
    };

    PSD.prototype.parseIrb = function() {
      var n, r, _ref;
      r = {};
      r.at = this.tell();
      _ref = this.readf(">4s H B"), r.type = _ref[0], r.id = _ref[1], r.namelen = _ref[2];
      n = this.pad2(r.namelen + 1) - 1;
      r.name = this.readf(">" + n + "s")[0];
      r.name = r.name.substr(0, r.name.length - 1);
      r.short = r.name.substr(0, 20);
      r.size = this.readf(">L")[0];
      this.seek(this.pad2(r.size));
      r.rdesc = "[" + RESOURCE_DESCRIPTIONS[r.id] + "]";
      Log.debug("Resource: ", r);
      this.resources.push(r);
      return 4 + 2 + this.pad2(1 + r.namelen) + 4 + this.pad2(r.size);
    };

    PSD.prototype.pad2 = function(i) {
      return Math.floor((i + 1) / 2) * 2;
    };

    PSD.prototype.pad4 = function(i) {
      return Math.floor((i + 3) / 4) * 4;
    };

    PSD.prototype.readf = function(format) {
      return jspack.Unpack(format, this.read(jspack.CalcLength(format)));
    };

    PSD.prototype.skipBlock = function(desc) {
      var n;
      n = this.readf('>L')[0];
      if (n) this.seek(n);
      return Log.debug("Skipped " + desc + " with " + n + " bytes");
    };

    return PSD;

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
