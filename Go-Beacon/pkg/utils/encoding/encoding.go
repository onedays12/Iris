package encoding

import (
	"bytes"
	"io"
	"strings"

	"golang.org/x/text/encoding"
	"golang.org/x/text/encoding/charmap"
	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/transform"
	"unicode/utf8"
)

var codePageMapping = map[int]encoding.Encoding{
	037:   charmap.CodePage037,
	437:   charmap.CodePage437,
	850:   charmap.CodePage850,
	852:   charmap.CodePage852,
	855:   charmap.CodePage855,
	858:   charmap.CodePage858,
	860:   charmap.CodePage860,
	862:   charmap.CodePage862,
	863:   charmap.CodePage863,
	865:   charmap.CodePage865,
	866:   charmap.CodePage866,
	936:   simplifiedchinese.GBK,
	1047:  charmap.CodePage1047,
	1140:  charmap.CodePage1140,
	1250:  charmap.Windows1250,
	1251:  charmap.Windows1251,
	1252:  charmap.Windows1252,
	1253:  charmap.Windows1253,
	1254:  charmap.Windows1254,
	1255:  charmap.Windows1255,
	1256:  charmap.Windows1256,
	1257:  charmap.Windows1257,
	1258:  charmap.Windows1258,
	20866: charmap.KOI8R,
	21866: charmap.KOI8U,
	28591: charmap.ISO8859_1,
	28592: charmap.ISO8859_2,
	28593: charmap.ISO8859_3,
	28594: charmap.ISO8859_4,
	28595: charmap.ISO8859_5,
	28596: charmap.ISO8859_6,
	28597: charmap.ISO8859_7,
	28598: charmap.ISO8859_8,
	28599: charmap.ISO8859_9,
	28605: charmap.ISO8859_15,
	65001: encoding.Nop,
}

// ConvertCpToUTF8 将字符串从特定代码页转换为 UTF-8。
// 增加了 UTF-8 自动识别逻辑：如果输入已经是合法的 UTF-8，则跳过转换。
func ConvertCpToUTF8(input string, codePage int) string {
	// 启发式检测：如果已经是 UTF-8，直接返回，防止二次转换乱码
	if utf8.ValidString(input) {
		return input
	}

	enc, exists := codePageMapping[codePage]
	if !exists {
		return input
	}

	reader := transform.NewReader(strings.NewReader(input), enc.NewDecoder())
	utf8Text, err := io.ReadAll(reader)
	if err != nil {
		return input
	}

	return string(utf8Text)
}

// ConvertUTF8toCp 将 UTF-8 字符串转换为特定代码页。
func ConvertUTF8toCp(input string, codePage int) string {
	enc, exists := codePageMapping[codePage]
	if !exists {
		return input
	}

	buf := new(bytes.Buffer)
	writer := transform.NewWriter(buf, enc.NewEncoder())
	_, err := writer.Write([]byte(input))
	if err != nil {
		return input
	}
	writer.Close()

	return buf.String()
}
