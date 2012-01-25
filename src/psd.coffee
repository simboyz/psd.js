if exports?
  Root = exports
  fs = require 'fs'
else
  Root = window

Root.PSD = class PSD
  @DEBUG = true

  @fromData: (data) -> new PSD data
  @fromFile: (filename) ->
    data = fs.readFileSync filename
    new PSD data

  @fromURL: (url) -> # TODO

  ###
  Private data
  ###
  HEADER_SECTIONS = [
    "sig"
    "version"
    "r0"
    "r1"
    "r2"
    "r3"
    "r4"
    "r5"
    "channels"
    "rows"
    "cols"
    "depth"
    "mode"
  ]

  CHANNEL_SUFFIXES =
    '-2': 'layer mask'
    '-1': 'A'
    0: 'R'
    1: 'G'
    2: 'B'
    3: 'RGB'
    4: 'CMYK'
    5: 'HSL'
    6: 'HSB'
    9: 'Lab'
    11: 'RGB'
    12: 'Lab'
    13: 'CMYK'

  RESOURCE_DESCRIPTIONS =
    1000: 'PS2.0 mode data'
    1001: 'Macintosh print record'
    1003: 'PS2.0 indexed color table'
    1005: 'ResolutionInfo'
    1006: 'Names of the alpha channels'
    1007: 'DisplayInfo'
    1008: 'Caption'
    1009: 'Border information'
    1010: 'Background color'
    1011: 'Print flags'
    1012: 'Grayscale/multichannel halftoning info'
    1013: 'Color halftoning info'
    1014: 'Duotone halftoning info'
    1015: 'Grayscale/multichannel transfer function'
    1016: 'Color transfer functions'
    1017: 'Duotone transfer functions'
    1018: 'Duotone image info'
    1019: 'B&W values for the dot range'
    1021: 'EPS options'
    1022: 'Quick Mask info'
    1024: 'Layer state info'
    1025: 'Working path'
    1026: 'Layers group info'
    1028: 'IPTC-NAA record (File Info)'
    1029: 'Image mode for raw format files'
    1030: 'JPEG quality'
    1032: 'Grid and guides info'
    1033: 'Thumbnail resource'
    1034: 'Copyright flag'
    1035: 'URL'
    1036: 'Thumbnail resource'
    1037: 'Global Angle'
    1038: 'Color samplers resource'
    1039: 'ICC Profile'
    1040: 'Watermark'
    1041: 'ICC Untagged'
    1042: 'Effects visible'
    1043: 'Spot Halftone'
    1044: 'Document specific IDs'
    1045: 'Unicode Alpha Names'
    1046: 'Indexed Color Table Count'
    1047: 'Transparent Index'
    1049: 'Global Altitude'
    1050: 'Slices'
    1051: 'Workflow URL'
    1052: 'Jump To XPEP'
    1053: 'Alpha Identifiers'
    1054: 'URL List'
    1057: 'Version Info'
    2999: 'Name of clipping path'
    10000: 'Print flags info'

  MODES =
    0:  'Bitmap'
    1:  'GrayScale'
    2:  'IndexedColor'
    3:  'RGBColor'
    4:  'CMYKColor'
    5:  'HSLColor'
    6:  'HSBColor'
    7:  'Multichannel'
    8:  'Duotone'
    9:  'LabColor'
    10: 'Gray16'
    11: 'RGB48'
    12: 'Lab48'
    13: 'CMYK64'
    14: 'DeepMultichannel'
    15: 'Duotone16'

  COMPRESSIONS =
    0: 'Raw'
    1: 'RLE'
    2: 'ZIP'
    3: 'ZIPPrediction'

  BLENDINGS =
    'norm': 'normal'
    'dark': 'darken'
    'mul ': 'multiply'
    'lite': 'lighten'
    'scrn': 'screen'
    'over': 'overlay'
    'sLit': 'soft-light'
    'hLit': 'hard-light'
    'lLit': 'linear-light'
    'diff': 'difference'
    'smud': 'exclusion'

  PIL_BANDS =
    'R': 0
    'G': 1
    'B': 2
    'A': 3
    'L': 0
  
  constructor: (@data) ->
    @pos = 0
    @header = null
    @resources = null
    @numLayers = 0
    @layers = null
    @images = null
    @mergedImage = null

  parse: ->
    Log.debug "Beginning parsing"

    @parseHeader()
    @parseImageResources()
    @parseLayersMasks()
    #@parseImageData()

    # TODO: benchmark info?
    Log.debug "Parsing finished"

  parseHeader: ->
    Log.debug "\n### Header ###"

    @header = {}

    data = @readf ">4sH 6B HLLHH"

    @header[section] = data.shift() for section in HEADER_SECTIONS
    @size = [@header['rows'], @header['cols']]

    if @header['sig'] isnt "8BPS"
      throw "Not a PSD signature: #{@header['sig']}"
    
    if @header['version'] isnt 1
      throw "Can not handle PSD version #{@header['version']}"

    if 0 <= @header['mode'] < 16
      @header['modename'] = MODES[@header['mode']]
    else
      @header['modename'] = "(#{@header['mode']})"

    Log.debug @header

    @header['colormodepos'] = @pos
    @skipBlock("color mode data")

  parseImageResources: ->
    Log.debug "\n### Resources ###"

    @resources = []

    [n] = @readf ">L"
    while n > 0
      n -= @parseIrb()

    Log.debug "Image resources overran expected size by #{-n} bytes" if n isnt 0

  parseLayersMasks: ->
    @parseHeader if not @header

    if not @resources
      @skipBlock('image resources')
      @resources = 'not parsed'

    Log.debug "\n### Layers & Masks ###"

    @layers = []
    @images = []
    @header.mergedalpha = false
    [misclen] = @readf ">L"

    if misclen
      miscstart = @tell()

      [layerlen] = @readf ">L"
      if layerlen
        # HACK HACK HACK
        # Not sure why subtraction needs to happen right now
        @numLayers = Math.pow(2, 16) - @readUInt16()
        if @numLayers < 0
          @numLayers *= -1
          Log.debug "First alpha transparency for merged image"
          @header.mergedalpha = true

        Log.debug "Layer info for #{@numLayers}:"

        if @numLayers * (18 + 6 * @header['channels']) > layerlen
          throw "Unlikely number of #{@numLayers} layers for #{@header['channels']} with #{layerlen} layerlen. Giving up."

        linfo = []

        for i in [0...@numLayers]
          l = {}
          l.idx = i

          ###
          Layer Info
          ###
          [l.top, l.left, l.bottom, l.right, l.channels] = @readf ">LLLLH"
          [l.rows, l.cols] = [l.bottom - l.top, l.right - l.left]

          Log.debug "Layer #{l.idx}:", l

          # Sanity check
          if l.bottom < l.top or l.right < l.left or l.channels > 64
            Log.debug "Somethings not right, attempting to skip layer."
            @seek 6 * l.channels + 12
            @skipBlock "layer info: extra data"
            continue # next layer

          # Read channel info
          l.chlengths = []
          l.chids = []

          # HACK HACK HACK
          l.chindex = [-1] * (l.channels + 2)

          for j in [0...l.channels]
            [chid, chlen] = @readf ">hL"
            l.chids.push chid
            l.chlengths.push chlen
            
            Log.debug "Channel #{j}: id=#{chid}, #{chlen} bytes"

            if -2 <= chid < l.channels
              # This may be Python only, just a heads up.
              l.chindex[chid] = j
            else
              Log.debug "Unexpected channel id #{chid}"

            l.chidstr = CHANNEL_SUFFIXES[chid]

          linfo.push l

          ###
          Blend mode
          ###
          bm = {}

          [bm.sig, bm.key, bm.opacity, bm.clipping, bm.flags, bm.filler] = @readf ">4s4sBBBB"
          bm.opacp = (bm.opacity * 100 + 127) / 255
          #bm.clipname = b.clipping ? 
          bm.blending = BLENDINGS[bm.key]
          l.blend_mode = bm

          Log.debug "Blending mode:", bm

          # remember position for skipping unrecognized data
          [extralen] = @readf ">L"
          extrastart = @tell()

          ###
          Layer mask data
          ###
          m = {}
          [m.size] = @readf ">L"
          if m.size
            [m.top, m.left, m.bottom, m.right, m.default_color, m.flags] = @readf ">LLLLBB"

            # skip remainder
            @seek m.size - 18
            [m.rows, m.cols] = [m.bottom - m.top, m.right - m.left]
          
          l.mask = m

          @skipBlock "layer blending ranges"

          ###
          Layer name
          ###
          [l.namelen] = @readf ">B"

          # From psdparse:
          # - "-1": one byte traling 0byte. "-1": one byte garble.
          # (l['name'],) = readf(f, ">%ds" % (self._pad4(1+l['namelen'])-2)) 
          [l.name] = @readf ">#{l.namelen}s"
          [signature, key, size] = @readf ">4s4s4s"
          if key is "luni"
            namelen = @i32 @read(4)
            namelen += namelen % 2
            l.name = ""
            for count in [0...namelen-1]
              l.name += chr(@i16(@read(2)))

          Log.debug "Layer name: #{l.name}"

          # Skip extra data
          @seek extrastart + extralen, false

          @layers.push l

        for i in [0...@numLayers]
          # Empty layer
          if linfo[i].rows * linfo[i].cols is 0
            @images.push null
            @parseImage linfo[i], true
            continue

          @images.push [0, 0, 0, 0]
          @parseImage linfo[i], true
          if linfo[i].channels is 2
            l = @images[i][0]
            a = @images[i][3]
            # TODO: what is LA mode?
          else
            if typeof @images[i][3] is "number"
              # TODO: merge RGB image
            else
              # TODO: merge RGBA image

      else
        Log.debug "Layer info section is empty"

      skip = miscstart + misclen - @tell()
      if skip
        Log.debug "Skipped #{skip} bytes at end of misc data?"
        @seek skip
    
    else
      Log.debug "Misc info section is empty"

  parseImage: (li, isLayer = true) ->
    @parseHeader() if not @header
    if not @resources
      @skipBlock('image resources')
      @resources = 'not parsed'

    Log.debug "# Image: #{li.name}/#{li.channels}"

  parseChannel: (li, idx, count, rows, cols, depth) ->


  ###
  Utility functions
  ###
  tell: -> @pos
  read: (bytes) -> (@data[@pos++] for i in [0...bytes])
  seek: (amount, rel = true) ->
    if rel then @pos += amount else @pos = amount

  readUInt32: ->
    b1 = @data[@pos++] << 24
    b2 = @data[@pos++] << 16
    b3 = @data[@pos++] << 8
    b4 = @data[@pos++]
    b1 | b2 | b3 | b4
      
  readUInt16: ->
    b1 = @data[@pos++] << 8
    b2 = @data[@pos++]
    b1 | b2

  i16: (c) -> ord(c[1]) + (ord(c[0])<<8)
  i32: (c) -> ord(c[3]) + (ord(c[2])<<8) + (ord(c[1])<<16) + (ord(c[0])<<24)

  parseIrb: ->
    r = {}
    r.at = @tell()
    [r.type, r.id, r.namelen] = @readf ">4s H B"
    n = @pad2(r.namelen + 1) - 1
    [r.name] = @readf ">#{n}s"
    r.name = r.name.substr(0, r.name.length - 1)
    r.short = r.name.substr(0, 20)
    [r.size] = @readf ">L"
    @seek @pad2(r.size)
    r.rdesc = "[#{RESOURCE_DESCRIPTIONS[r.id]}]"
    
    Log.debug "Resource: ", r
    @resources.push r

    4 + 2 + @pad2(1 + r.namelen) + 4 + @pad2(r.size)

    
  pad2: (i) -> Math.floor((i + 1) / 2) * 2
  pad4: (i) -> Math.floor((i + 3) / 4) * 4
  readf: (format) -> jspack.Unpack format, @read(jspack.CalcLength(format))

  skipBlock: (desc) ->
    [n] = @readf('>L')
    @seek(n) if n # relative

    Log.debug "Skipped #{desc} with #{n} bytes"
  