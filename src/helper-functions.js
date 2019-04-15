const RGX_CELL_PLACEHOLDER = /\$\{(?:(value|cell|0|[1-9]\d*)|(col|var):((?:[^\}:\\]*|\\.)+))(?::(?:(raw)|(escape)|(param)(?::((?:[^\}:\\]*|\\.)+))?))?\}/g;
const RGX_ESCAPED_CHARS = /\\(.)/g;

/**
 * Converts an array of arrays of values to a CSV string.
 * @param rows {Array<Array>}
 *     An array of arrays of values that should be converted to a CSV string.
 * @param opt_options {Object=}
 *     Optional.  If this contains a `nullString` property the value will be used
 *     as the string that will appear whenever `null` or `undefined` is found.
 *     If this contains a `headers` property the value should be an array
 *     indicating the headers to be included as the first row.
 * @returns {string}
 *     The CSV version of `rows` with any specified options.
 */
function toCSV(rows, opt_options) {
  opt_options = Object(opt_options);
  if (opt_options.headers) {
    rows = [opt_options.headers].concat(rows);
  }
  var nullString = opt_options.hasOwnProperty('nullString') ? opt_options.nullString : '(NULL)';
  return rows
    .map(function (row) {
      return row.map(function (cell) {
        cell = cell != null
          ? 'function' === typeof cell.toString
            ? cell + ""
            : Object.prototype.toString.call(cell)
          : nullString;
        return /[",\n\r]/.test(cell) ? '"' + (cell).replace(/"/g, '""') + '"' : cell;
      }).join(',');
    })
    .join('\n');
}

function parseRegExp(strPattern) {
  let parts = /^\/(.+)\/(\w*)$/.exec(strPattern);
  return parts ? new RegExp(parts[1], parts[2]) : new RegExp('^' + _.escapeRegExp(strPattern) + '$', 'i');
}

function pseudoCssToJSON(strLess) {
  var openCount = 0;
  var closeCount = 0;

  strLess = strLess
    .replace(/\/\*[^]*?\*\//g, '')
    .replace(
      /([^\{\};]+)\{|([^:\{\}]+):([^;]+);|\}/g,
      function (match, ruleName, styleName, styleValue) {
        if (ruleName) {
          openCount++;
          return JSON.stringify(ruleName.trim()) + ":{";
        }
        if (styleName) {
          return JSON.stringify(styleName.trim()) + ":" + JSON.stringify(styleValue.trim()) + ",";
        }
        closeCount++;
        return "},";
      }
    )
    .replace(/,\s*(\}|$)/g, '$1');

  try {
    return JSON.stringify(JSON.parse("{" + strLess + "}"), null, 2);
  }
  catch (e) {
    throw new Error(
      openCount !== closeCount
        ? "Pseudo-CSS contains too many " + (openCount > closeCount ? "open" : "clos") + "ing braces."
        : "Pseudo-CSS couldn't be parsed correctly."
    );
  }
}

function getCellValue(valToMod, isForLink, { cell, cellsByColName, ruleType, rgx, ctrl, varsByName }) {
  let matches = ruleType === 'FILTER'
    ? cell != null
      ? rgx.exec(cell + '')
      : { '0': 'null' }
    : { '0': cell };
  matches.value = cell;
  matches.cell = cell;
  
  let match, match0, matchesKey, name, isRaw, result, offset = 0;
  while (match = RGX_CELL_PLACEHOLDER.exec(valToMod)) {
    match0 = match[0];
    matchesKey = match[1];
    name = match[3];
    isRaw = match[4] || !(isForLink || match[5]);
    name = matchesKey || (name && name.replace(RGX_ESCAPED_CHARS, '$1'));
    result = [...new Set(
      matchesKey
        ? _.has(matches, matchesKey) ? [matches[matchesKey]] : []
        : match[2] === 'col'
          ? _.has(cellsByColName, name) ? [cellsByColName[name]] : []
          : _.has(varsByName, name) ? varsByName[name] : []
    )];
    result = result.length < 1
      ? match0
      : isRaw
        ? result.join(',')
        : match[6]
          ? result.map(v => encodeURIComponent(match[7] == undefined ? name : match[7]) + '=' + encodeURIComponent(v)).join('&')
          : encodeURIComponent(result.join(','));
    valToMod = valToMod.slice(0, match.index + offset) + result + valToMod.slice(match0.length + offset);
    offset += result.length - match0.length;
  }
  return valToMod;
}

const getHtmlText = (div => html => (div.innerHTML = html, div.textContent))(document.createElement('div'));

module.exports = { toCSV, parseRegExp, pseudoCssToJSON, getCellValue, getHtmlText };