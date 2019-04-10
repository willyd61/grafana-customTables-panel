import {MetricsPanelCtrl} from 'app/plugins/sdk';
import _ from 'lodash';
import * as JS from './external/YourJS.min';
import { toCSV, parseRegExp, pseudoCssToJSON, getCellValue, getHtmlText } from './helper-functions';
import './external/datatables/js/jquery.dataTables.min';
import './external/datatables/js/dataTables.fixedHeader.min';
import './external/datatables/css/jquery.dataTables.min.css!';
import './external/datatables/css/fixedHeader.dataTables.min.css!';


const DEFAULT_PSEUDO_CSS = `
.theme-dark & {
  color: white;
}
table.dataTable tbody tr {
  &:hover td {
    background-image: linear-gradient(0deg, rgba(128,128,128,0.1), rgba(128,128,128,0.1));
  }
  &, &.even, &.odd {
    background-color: transparent;
    td {
      border-color: transparent;
    }
  }
  &.odd {
    background-color: rgba(128,128,128,0.3);
  }
  &.even {
    background-color: rgba(128,128,128,0.15);
  }
}
`;

const TOOLTIP_PLACEMENTS = [
  { "id": "TOP", "text": "Top" },
  { "id": "LEFT", "text": "Left" },
  { "id": "RIGHT", "text": "Right" },
  { "id": "BOTTOM", "text": "Bottom" }
];

const CONTENT_RULE_TYPES = [
  { id: 'FILTER', text: 'Filter by exact value or RegExp' },
  { id: 'RANGE', text: "Match a range of values" },
  { id: 'NULL', text: "Is NULL" }
];

const CONTENT_RULE_CLASS_LEVELS = [
  { id: 'CELL', text: "Only the cell" },
  { id: 'ROW', text: 'Entire row' }
];

const CONTENT_RULE_MAX_VALUE_OPS = [
  { id: '', text: '' },
  { id: '>=', text: '\u2265 (greater than or equal to)' },
  { id: '>', text: '> (greater than)' }
];

const CONTENT_RULE_MIN_VALUE_OPS = [
  { id: '', text: '' },
  { id: '<', text: '< (less than)' },
  { id: '<=', text: '\u2264 (less than or equal to)' }
];

const CONTENT_RULE_EXACT_NUM_OPS = [
  { id: '==', text: '= (equals)' },
  { id: '!=', text: "\u2260 (doesn't)" }
];

const DEFAULT_PANEL_SETTINGS = {
  allowLengthChange: true,
  allowOrdering: true,
  allowSearching: true,
  columnDefs: [],
  initialPageLength: 25,
  isFullWidth: true,
  pageLengths: '10,15,20,25,50,100',
  pseudoCSS: DEFAULT_PSEUDO_CSS,
  varCols: {
    dataRefId: null,
    mainJoinColumn: null,
    joinColumn: null,
    nameColumn: null,
    valueColumn: null
  }
};

export class DataTablePanelCtrl extends MetricsPanelCtrl {
  constructor($scope, $injector, $rootScope) {
    super($scope, $injector);

    this.$rootScope = $rootScope;

    _.defaultsDeep(this.panel, DEFAULT_PANEL_SETTINGS);

    this.events.on('init-edit-mode', this.onInitEditMode.bind(this));
    this.events.on('data-received', this.onDataReceived.bind(this));
    this.events.on('data-snapshot-load', this.onDataReceived.bind(this));
    this.events.on('data-error', this.onDataError.bind(this));
    this.events.on('init-panel-actions', this.onInitPanelActions.bind(this));
    this.events.on('render', this.onPanelSizeChanged.bind(this));
    this.events.on('view-mode-changed', this.draw.bind(this));
  }

  drawIfChanged() {
    if (this.panelJSON !== this.getPanelSettingsJSON()) {
      this.draw();
    }
  }

  getPanelSettingsJSON(spacing) {
    let panel = this.panel;
    return JSON.stringify(
      panel,
      function (key, value) {
        return (this != panel || _.has(DEFAULT_PANEL_SETTINGS, key))
          ? value
          : undefined;
      },
      spacing
    );
  }

  onPanelSizeChanged() {
    this.fixDataTableSize();
  }

  onInitEditMode() {
    let path = 'public/plugins/copperhill-datatables-panel/partials/';
    this.addEditorTab('Table View', `${path}refresh-view.html`, 1);
    this.addEditorTab('Variable Columns', `${path}var-cols.html`, 2);
    this.addEditorTab('Editor', `${path}editor.html`, 3);
    this.addEditorTab('Column Definitions', `${path}column-defs.html`, 4);
    this.addEditorTab('Styles', `${path}styles.html`, 5);
    this.addEditorTab('Table View', `${path}refresh-view.html`, 6);
  }

  onInitPanelActions(actions) {
    actions.push({ text: 'Export CSV', click: 'ctrl.exportCSV()' });
  }

  onDataError() {
    this.draw();
  }

  onDataReceived(dataList) {
    if (dataList && dataList.length) {
      dataList.forEach(data => data.isReal = true);
      this.dataList = dataList;
      this.updateDataListOptions();
    }
    else {
      let EXTRA_COLS = 2;
      this.dataList = [
        {
          columns: [{ text: "X" }, { text: "X * X" }, { text: "X + X" }].concat(_.range(EXTRA_COLS).map(y => ({ text: `${y} / Math.random()` }))),
          rows: _.range(150).map(x => [x, x * x, x + x].concat(_.range(EXTRA_COLS).map(y => y / Math.random()))),
          isReal: false,
          type: 'table'
        }
      ];
    }

    this.draw();
  }

  getConstByName(name) {
    if (/^[A-Z_][A-Z_0-9]*$/.test(name)) {
     return eval(name);
    }
  }

  addColumnDef() {
    this.panel.columnDefs.push({
      filter: '/[^]*/',
      display: '${value}',
      displayIsHTML: false,
      url: '',
      openNewWindow: true,
      width: '',
      classNames: '',
      isVisible: true,
      isOrderable: true,
      isSearchable: true,
      contentRules: []
    });
  }

  removeColumnDef(columnDef) {
    let columnDefs = this.panel.columnDefs;
    columnDefs.splice(columnDefs.indexOf(columnDef), 1);
  }

  addColumnContentRule(columnDef) {
    columnDef.contentRules.push({
      type: CONTENT_RULE_TYPES[0].id,
      classNames: '',
      classLevel: CONTENT_RULE_CLASS_LEVELS[0].id,
      filter: '',
      negateCriteria: false,
      display: '${value}',
      displayIsHTML: false,
      minValue: null,
      maxValue: null,
      minValueOp: null,
      maxValueOp: null,
      url: '',
      openNewWindow: true,
      tooltip: {
        isVisible: false,
        display: '',
        placement: TOOLTIP_PLACEMENTS[0].id
      }
    });
  }

  removeColumnContentRule(contentRule, columnDef) {
    let contentRules = columnDef.contentRules;
    contentRules.splice(contentRules.indexOf(contentRule), 1);
  }

  updateDataListOptions() {
    this.dataListOptions = [{}].concat(this.dataList).map((x, i) => ({
      id: i ? x.refId : null,
      text: i ? x.refId : '--- NONE ---'
    }));
  }

  getPageLengthOptions() {
    return this.panel.pageLengths
        .replace(/\s+/g, '')
        .split(',')
        .reduce(
          (arr, x) => {
            if (+x === parseInt(x, 10) && +x >= -1) {
              x = x == -1 ? Infinity : +x;
              arr.push({ value: x, text: x === Infinity ? 'All' : x });
            }
            return arr;
          },
          []
        );
  }

  exportCSV() {
    let data = this.getData();
    JS.dom({
      _: 'a',
      href: 'data:text/csv;charset=utf-8,' + encodeURIComponent(
        toCSV(
          data.rows.map(row => row.reduce((carry, cell) => {
            if (cell.visible) {
              carry.push(getHtmlText(cell.html));
            }
            return carry;
          }, [])),
          {
            headers: data.columns.reduce((carry, header) => {
              if (header.visible) {
                carry.push(getHtmlText(header.html));
              }
              return carry;
            }, [])
          }
        )
      ),
      download: this.panel.title + JS.formatDate(new Date, " (YYYY-MM-DD 'at' H.mm.ss).'csv'")
    }).click();
  }

  getVarsByName() {
    return this.templateSrv.variables.reduce(
      (carry, variable) => {
        // At times current.value is a string and at times it is an array.
        let varValues = JS.toArray(variable.current.value);
        let isAll = variable.includeAll && varValues.length === 1 && varValues[0] === '$__all';
        carry[variable.name] = isAll ? [variable.current.text] : varValues;
        return carry;
      },
      {}
    );
  }

  drawDataTable(data) {
    let ctrl = this;
    let panel = ctrl.panel;
    let jElem = ctrl.panelElement;
    let height = jElem.height();
    let columns = data.columns;
    let rows = data.rows;
    let domTable = { _: 'table', style: {} };
    if (panel.isFullWidth) {
      domTable.style.width = '100%';
    }

    let table = JS.dom(domTable);
    let jTable = jQuery(table).appendTo(jElem.html(''));
    let headers = data.headers;
    let dataTableOpts = {
      columns: columns.map((column, colIndex) => {
        let result = {
          title: getHtmlText(column.html),
          visible: column.visible
        };

        let colDef = column.colDef;
        if (colDef && column.visible) {
          if (colDef.width) {
            result.width = colDef.width;
          }
          if (colDef.classNames) {
            result.className = colDef.classNames;
          }
          result.orderable = colDef.isOrderable;
          result.searchable = colDef.isSearchable;
        }

        return result;
      }),
      headerCallback(tr) {
        let thIndex = 0;
        columns.forEach(col => {
          if (col.visible) {
            let jTH = jQuery('>th', tr).eq(thIndex++).html(col.html);
          }
        });
      },
      data: rows.map(row => row.map(cell => getHtmlText(cell.html))),
      rowCallback(tr, rowData, pageDisplayIndex, displayIndex, rowIndex) {
        let tdIndex = 0;
        let row = rows[rowIndex];
        rowData.forEach((cellText, colIndex) => {
          let cell = rows[rowIndex][colIndex];
          if (cell.visible) {
            let jTD = jQuery('> td', tr).eq(tdIndex++);
            if (cell.cls && cell.cls.level === 'CELL') {
              jTD.addClass(cell.cls.names);
            }
            let colDef = columns[colIndex].columnDef;
            if (colDef && colDef.classNames) {
              jTD.addClass(colDef.classNames);
            }
            let html = cell.html;
            if (cell.tooltip) {
              html = `<div data-tooltip data-original-title="${_.escape(cell.tooltip.display)}" data-placement="${cell.tooltip.placement}" class="d-inline-block">${html}</div>`;
            }
            jTD.html(html);
          }
          if (cell.cls && cell.cls.level === 'ROW') {
            jQuery(tr).addClass(cell.cls.names);
          }
        });
      },
      scrollY: height,
      scrollX: true,
      scrollCollapse: true,
      ordering: panel.allowOrdering,
      searching: panel.allowSearching,
      lengthChange: panel.allowLengthChange,
      lengthMenu: ctrl.getPageLengthOptions().reduce(
        (arr, opt) => [
          arr[0].concat([opt.value === Infinity ? -1 : opt.value]),
          arr[1].concat([opt.value === Infinity ? 'All' : opt.value])
        ],
        [[], []]
      ),
      pageLength: panel.initialPageLength,
      order: []
    };
    let dataTable = jTable.DataTable(dataTableOpts);

    // Horizontally center tables that are not full page width.
    jElem.find('.dataTables_scrollHeadInner').css('margin', '0 auto');

    // Resize the scroll body of the table.
    ctrl.fixDataTableSize();

    // Remove the old class names from the wrapper element and add a new
    // targeted stylesheet.
    jElem.each((i, elem) => {
      elem.className = elem.className.replace(/\b_\d+\b/g, ' ').replace(/\s+/g, ' ').trim();
      elem.appendChild(JS.css(JSON.parse(pseudoCssToJSON(panel.pseudoCSS)), elem));
    });
  }

  getVarColColumns() {
    let data = this.getVarColsData();
    return data ? data.columns : [];
  }

  getVarColsData() {
    let varCols = this.panel.varCols;
    let dataRefId = varCols && varCols.dataRefId;
    let dataList = this.dataList;
    return dataList && dataList.find(({ refId }) => refId === dataRefId);
  }

  putVarColsIn(data) {
    let varCols = this.panel.varCols;
    let columns = data.columns;
    let rows = data.rows.slice();

    const MAIN_COL_COUNT = columns.length;
    const MAIN_ROW_COUNT = rows.length;

    if (varCols) {
      let vcData = this.getVarColsData();
      if (vcData) {
        let vcHeaders = vcData.columns.map(col => col.text);
        let mainJoinColIndex = columns.findIndex(c => c.text === varCols.mainJoinColumn);
        let joinColIndex = vcHeaders.indexOf(varCols.joinColumn);
        let nameColIndex = vcHeaders.indexOf(varCols.nameColumn);
        let valueColIndex = vcHeaders.indexOf(varCols.valueColumn);
        if (mainJoinColIndex >= 0 && joinColIndex >= 0 && nameColIndex >= 0 && valueColIndex >= 0) {
          let mainRowIndex = 0;
          
          // Order a sliced version of the main `rows` using the join column.
          rows.sort((a, b) => a[mainJoinColIndex] < b[mainJoinColIndex] ? -1 : 1);

          // Order a sliced version of the varCols rows using the join column.
          let vcRowsPrime = vcData.rows;
          let vcRows = vcRowsPrime.slice().sort((a, b) => a[joinColIndex] < b[joinColIndex] ? -1 : 1);

          // Used later to reorder the new columns by the order they were found
          // in the data.
          let vcColIndexPairs = [];

          vcRows
            // Get a list of all of the new headers while simultaneously adding
            // the data to the appropriate rows and in the appropriate columns.
            .reduce((vcHeaders, vcRow) => {
              let vcHeader = vcRow[nameColIndex];
              let vcJoinValue = vcRow[joinColIndex];
              let colIndex = vcHeaders.indexOf(vcHeader);
              let isNewVCHeader = colIndex < 0;

              // If the new column wasn't found add it.
              if (isNewVCHeader) {
                colIndex = vcHeaders.push(vcHeader) - 1;
              }

              // Since everything is ordered continue in `rows` looking for the
              // join and if found add the value there while setting the new row's
              // index as `mainRowIndex`.
              for (let mainRow, i = mainRowIndex; i < MAIN_ROW_COUNT; i++) {
                mainRow = rows[i];
                if (vcJoinValue === mainRow[mainJoinColIndex]) {
                  mainRow[MAIN_COL_COUNT + colIndex] = vcRow[valueColIndex];
                  mainRowIndex = i;

                  // NOTE:  Return here to avoid checking `i` outside of loop.
                  return vcHeaders;
                }
              }

              // If new header was added but join was unsuccessful remove the new
              // header.
              if (isNewVCHeader) {
                vcHeaders.pop();
              }

              return vcHeaders;
            }, [])
            // Add the new `columns`.
            .forEach((vcHeader, vcHeaderIndex) => {
              vcColIndexPairs.push({
                first: vcRowsPrime.findIndex(vcRow => vcRow[nameColIndex] === vcHeader),
                index: vcHeaderIndex + MAIN_COL_COUNT
              });
              columns.push({ text: vcHeader });
            });

          // Used to reorder all of the var-cols
          vcColIndexPairs.sort((a, b) => a.first - b.first);
          const SPLICE_ARGS = [MAIN_COL_COUNT, vcColIndexPairs.length];

          // Reorder all of the var-cols
          columns.splice.apply(
            columns,
            SPLICE_ARGS.concat(vcColIndexPairs.map(pair => columns[pair.index]))
          );

          // Reorder all of the var-col cells in each row.
          rows.forEach(row => {
            row.splice.apply(
              row,
              SPLICE_ARGS.concat(vcColIndexPairs.map(pair => {
                pair = row[pair.index];
                return pair === undefined ? null : pair;
              }))
            );
          });
        }
      }
    }
  }

  getData() {
    let ctrl = this;
    let dataList = ctrl.dataList[0];
    let columns = dataList.columns.map(col => _.cloneDeep(col));
    let rows = dataList.rows.map(row => row.slice());
    let varsByName = ctrl.getVarsByName();
    let panel = ctrl.panel;
    let colDefs = panel.columnDefs;
    let varCols = panel.varCols;
    let colDefRgxs = colDefs.map(colDef => parseRegExp(colDef.filter));
    let colDefContentRuleFilters = colDefs.map(
      colDef => colDef.contentRules.map(
        rule => rule.type === 'FILTER' ? parseRegExp(rule.filter) : null
      )
    );

    // Create the data object to be returned.
    let data = { columns, rows, type: dataList.type, refId: dataList.refId };

    // Add the variable columns to the data if there are any.
    this.putVarColsIn(data);

    // Make an array of column headers.
    let headers = data.headers = columns.map(col => col.text);

    columns.forEach((column, colIndex) => {
      column = _.extend(
        'string' === typeof column ? { text: column } : column,
        { visible: true }
      );

      colDefRgxs.find((colDefRgx, colDefIndex) => {
        if (colDefRgx.test(column.text)) {
          let colDef = colDefs[colDefIndex];
          let gcvOptions = {
            cell: column.text,
            cellsByColName: {},
            ruleType: 'FILTER',
            rgx: colDefRgx,
            ctrl,
            varsByName
          };
          column.text = getCellValue(colDef.display, false, gcvOptions);

          let html = colDef.displayIsHTML ? column.text : _.escape(column.text);

          if (colDef.url) {
            let url = _.escape(getCellValue(colDef.url, true, gcvOptions));
            let target = colDef.openNewWindow ? '_blank' : '';
            html = `<a href="${url}" target="${target}" onclick="event.stopPropagation()">${html}</a>`;
          }

          _.extend(column, {
            colDef,
            colDefContentRuleFilters: colDefContentRuleFilters[colDefIndex],
            html: html,
            visible: colDef.isVisible
          });

          return true;
        }
      });

      if (!_.has(column, 'html')) {
        column.html = _.escape(column.text);
      }

      columns[colIndex] = column;
    });

    rows.forEach(row => {
      row.forEach((cellValue, colIndex) => {
        let ruleApplied;
        let column = columns[colIndex];
        let colDef = column.colDef;

        let cell = {
          html: cellValue,
          visible: column.visible
        };

        if (colDef) {
          let rules = colDef.contentRules;
          let cellsByColName = row.reduceRight(
            (carry, val, i) => _.extend(carry, { [headers[i]]: val }),
            {}
          );

          // Use Array#find() solely to match the first applicable rule...
          rules.find((rule, ruleIndex) => {
            let isMatch = true;
            let type = rule.type;
            let colDefContentRuleFilter = column.colDefContentRuleFilters[ruleIndex];
            let gcvOptions = {
              cell: cell.html,
              cellsByColName,
              ruleType: rule.type,
              rgx: colDefContentRuleFilter,
              ctrl,
              varsByName
            };
            if (type === 'FILTER') {
              isMatch = colDefContentRuleFilter.test(cell.html);
            }
            else if (type === 'RANGE') {
              let minValue = rule.minValue;
              let minIsNum = RGX_SIMPLE_NUMBER.test(minValue);
              let maxValue = rule.maxValue;
              let maxIsNum = RGX_SIMPLE_NUMBER.test(maxValue);
              if (minIsNum) {
                minValue = +minValue;
              }
              if (maxIsNum) {
                maxValue = +maxValue;
              }

              if (minIsNum || maxIsNum) {
                cellValue = +cellValue;
              }

              let minValueOp = rule.minValueOp;
              if (minValueOp) {
                isMatch = isMatch && (minValueOp === '<=' ? minValue <= cellValue : (minValue < cellValue));
              }
              let maxValueOp = rule.maxValueOp;
              if (maxValueOp) {
                isMatch = isMatch && (maxValueOp === '>=' ? maxValue >= cellValue : (maxValue > cellValue));
              }
            }
            else {
              isMatch = cell.html == null;
            }

            isMatch = isMatch !== rule.negateCriteria;

            // If this is a match apply the class(es)
            if (isMatch) {
              if (rule.classNames) {
                cell.cls = {
                  names: getCellValue(rule.classNames, false, gcvOptions),
                  level: rule.classLevel
                };
              }

              // Set the display
              let displayHTML = getCellValue(rule.display, false, gcvOptions);
              if (!rule.displayIsHTML) {
                displayHTML = _.escape(displayHTML);
              }
              if (rule.url) {
                let url = _.escape(getCellValue(rule.url, true, gcvOptions));
                let target = rule.openNewWindow ? '_blank' : '';
                let tooltipHTML = '';
                if (rule.tooltip.isVisible) {
                  cell.tooltip = {
                    display: getCellValue(rule.tooltip.display, false, gcvOptions),
                    placement: rule.tooltip.placement.toLowerCase()
                  };
                }
                displayHTML = `<a href="${url}" target="${target}">${displayHTML}</a>`;
              }
              cell.html = displayHTML;
              ruleApplied = rule;
            }

            return isMatch;
          });
        }

        if (!ruleApplied) {
          cell.html = _.escape(cell.html);
        }

        row[colIndex] = cell;
      });
    });

    return data;
  }

  fixDataTableSize() {
    let jElem = this.panelElement;
    let fullHeight = jElem.height();
    let jWrap = jElem.find('.dataTables_wrapper');
    if (jWrap.length) {
      let wrapHeight = jWrap.height();
      let jScrollBody = jWrap.find('.dataTables_scrollBody');
      let scrollHeight = jScrollBody.height();
      let nonScrollHeight = wrapHeight - scrollHeight;
      jScrollBody.css('max-height', fullHeight - nonScrollHeight);
    }
  }

  draw() {
    let error;
    let isValid = false;
    let ctrl = this;
    let jElem = ctrl.element;
    let jContent = ctrl.panelElement.css('position', 'relative').html('');
    let elemContent = jContent[0];
    let data = ctrl.getData();

    ctrl.pageLengthOptions = ctrl.getPageLengthOptions();

    if (data && data.rows.length) {
      if (data.type === 'table') {
        try {
          ctrl.drawDataTable(data);
          ctrl.panelJSON = this.getPanelSettingsJSON();
          jElem.tooltip({ selector: '[data-tooltip]' });
          isValid = true;
        }
        catch (err) {
          error = err;
        }
      }
    }
    if (!isValid) {
      let msg = 'No data' + (error ? ':  \r\n' + error.message : '.');
      let elemMsg = JS.dom({
        _: 'div', style: { display: 'flex', alignItems: 'center', textAlign: 'center', height: '100%' }, $: [
          { _: 'div', cls: 'alert alert-error', style: { margin: '0px auto' }, text: msg }
        ]
      });
      jContent.html('').append(elemMsg);
      if (error) {
        throw error;
      }
    }
  }

  link(scope, elem, attrs, ctrl) {
    this.element = elem;
    this.panelElement = elem.find('.panel-content');
    this.throttleDraw = _.debounce(this.draw.bind(this), 1000);
  }
}

DataTablePanelCtrl.templateUrl = 'partials/module.html';
