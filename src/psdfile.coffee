# Simulation and abstraction of a disk-based file.
# Provides methods to read the raw binary file data, which
# is stored in a variable instead of read from disk.
class PSDFile
  constructor: (@data) ->
    @pos = 0

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

  readInt: -> @file.read 4
  readShortInt: -> @file.read 2
  readDouble: -> @file.read 8
  readBoolean: -> @file.read(1) isnt 0
  readUnicodeString: ->
    str = ""
    strlen = @readInt()
    for i in [0...strlen]
      charCode = @readShortInt()
      str += chr(Util.i16(charCode)) if charCode > 0

    str

  readDescriptorStructure: ->
    name = @readUnicodeString()
    classID = @readLengthWithString()
    items = @readInt()

    descriptors = {}
    for i in [0...items]
      key = @readLengthWithString().trim()
      descriptors[key] = @readOsType()

    descriptors

  readString: (length) -> @readf ">#{length}s"
  readLengthWithString: (defaultLen = 4) ->
    length = @readInt()
    if length is 0
      [str] = @readf ">#{defaultLen}s"
    else
      [str] = @readf ">#{length}s"

    str

  readOsType: ->
    osType = @readString(4)
    value = null
    switch osType
      when "TEXT" then value = @readUnicodeString()
      when "enum", "Objc", "GlbO"
        value =
          typeID: @readLengthWithString()
          enum: @readLengthWithString()
      when "VlLs"
        listSize = @readInt()
        value = []
        value.push(@readOsType()) for i in [0...listSize]
      when "doub" then value = @readDouble()
      when "UntF"
        value =
          type: @readString(4)
          value: @readDouble()
      when "long" then value = @readInt()
      when "bool" then value = @readBoolean()
      when "alis"
        length = @readInt()
        value = @readString(length)
      when "obj"
        num = @readInt()
        for i in [0...num]
          type = @readString(4)
          switch type
            when "prop"
              value =
                name: @readUnicodeString()
                classID: @readLengthWithString()
                keyID: @readLengthWithString()
            when "Clss"
              value =
                name: @readUnicodeString()
                classID: @readLengthWithString()
            when "Enmr"
              value =
                name: @readUnicodeString()
                classID: @readLengthWithString()
                typeID: @readLengthWithString()
                enum: @readLengthWithString()
            when "rele"
              value =
                name: @readUnicodeString()
                classID: @readLengthWithString()
                offsetValue: @readInt()
            when "Idnt", "indx", "name" then value = null
      when "tdta"
        # Skip this
        length = @readInt()
        @seek length

    {type: osType, value: value}
  
  readf: (format) -> jspack.Unpack format, @read(jspack.CalcLength(format))

  skipBlock: (desc) ->
    [n] = @readf('>L')
    @seek(n) if n # relative

    Log.debug "Skipped #{desc} with #{n} bytes"