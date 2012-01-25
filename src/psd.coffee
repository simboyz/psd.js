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
    @header = {}
    @resources = []
    @numLayers = 0
    @layers = null
    @images = null
    @mergedImage = null

  parse: ->
    Log.debug "Beginning parsing"

    @parseHeader()
    @parseImageResources()
    #@parseLayersMasks()
    #@parseImageData()

    # TODO: benchmark info?
    Log.debug "Parsing finished"

  parseHeader: ->
    Log.debug "\n### Header ###"

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

    [n] = @readf ">L"
    while n > 0
      n -= @parseIrb()

    Log.debug "Image resources overran expected size by #{-n} bytes" if n isnt 0

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
  