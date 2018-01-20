function _test(){
  function assert(val, msg){
    if(!val){
      let _msg = ("assert fail" + (msg ? ": " + msg : ""))
      throw new Error(_msg);
    }else{
      // puts("OK");
    }
  }
  function assertEq(act, exp, msg){
    if( act != exp ){
      let _msg = "assert fail:";
      _msg += "\n" + "  expected (" + exp + ") (" + (typeof exp) + ")";
      _msg += "\n" + "  actual   (" + act + ") (" + (typeof act) + ")";
      let e = new Error(_msg);
      let stacks = e.stack.split("\n");
      _msg += "\n" + stacks[1];
      throw new Error(_msg);
    }else{
      // puts("OK");
    }
  }

  function inspectToken(t){
    return t.type + ":" + t.str;
  }

  const tests = [
    function test_isNumber(){
      assertEq(isNumber("123"), true);
      assertEq(isNumber("-1,234"), true);
      assertEq(isNumber("a"), false);
    },

    function test_strlen(){
      assertEq(strlen("a"), 1);
      assertEq(strlen("あ"), 2);
    },

    function test_StrScan_isEos(){
      const ss = new StrScan("abcdefg");

      assertEq(ss.isEos(), false);

      ss.movePos(6);
      assertEq(ss.isEos(), false);

      ss.movePos(1);
      assertEq(ss.isEos(), true);
    },

    function test_StrScan_substring(){
      const ss = new StrScan("abcdefg");

      assertEq(ss.substring(2, 5), "cde");
    },

    function test_StrScan_movePos(){
      const ss = new StrScan("abcdefg");

      ss.movePos(3);
      assertEq(ss.pos, 3);
      assertEq(ss.rest, "defg");
    },

    function test_StrScan_scan(){
      const ss = new StrScan("abcdefg");
      ss.scan(/bc/);

      assertEq(ss.rest, "cdefg");
      assertEq(ss.posBom, 0);
      assertEq(ss.pos, 2);
      assertEq(ss.m[0], "bc");

      ss.scan(/ef/);

      assertEq(ss.rest, "efg");
      assertEq(ss.posBom, 2);
      assertEq(ss.pos, 4);
      assertEq(ss.m[0], "ef");
    },

    function test_ColContent__tokenize(){
      const ts = ColContent._tokenize("a").map(inspectToken);
      assertEq(ts.length, 1);
      assertEq(ts[0], "plain:a");
    },

    function test_ColContent__tokenize_space(){
      const ts = ColContent._tokenize("a ").map(inspectToken);
      assertEq(ts.length, 2);
      assertEq(ts[0], "plain:a");
      assertEq(ts[1], "space: ");
    },

    function test_ColContent__tokenize_ctrl_cd(){
      const ts = ColContent._tokenize("a\t\\").map(inspectToken);
      assertEq(ts.length, 3);
      assertEq(ts[0], "plain:a");
      assertEq(ts[1], "ctrl_cd:\t");
      assertEq(ts[2], "ctrl_cd:\\");
    },

    function test_ColContent__toHtml(){
      const html = ColContent._toHtml([
        { type: "plain", str: "ab" }
      ]);
      assertEq(html, "ab");
    },

    function test_ColContent__toHtml_space(){
      const html = ColContent._toHtml([
        { type: "plain", str: "a" },
        { type: "space", str: " " }
      ]);
      assertEq(html, 'a<span class="col_space"> </span>');
    },

    function test_ColContent__toHtml_ctrl_cd(){
      const html = ColContent._toHtml([
        { type: "plain", str: "a" },
        { type: "ctrl_cd", str: "\t" }
      ]);
      assertEq(html, 'a<span class="col_ctrl_cd">\\t</span>');
    },

    function test_parse_regexp(){
      const rows = parse_regexp(
        "aa bb  cc" + "\n" +
        " dd  ee" + "\n",
        {re: / +/}
      );
      assertEq(rows.length, 2);

      const lines = rows.map(row => row.join(","));
      assertEq(lines[0], "aa,bb,cc");
      assertEq(lines[1], ",dd,ee");
    },

    function test_parse_mysql(){
      const rows = parse_mysql(
        "| aa | bb | cc |" + "\n" +
        "|    | dd | ee |" + "\n"
      );
      assertEq(rows.length, 2);

      const lines = rows.map(row => row.join(","));
      assertEq(lines[0], "aa,bb,cc");
      assertEq(lines[1], ",dd,ee");
    },

    function test_parse_postgresql(){
      const rows = parse_postgresql(
        " aa | bb | cc " + "\n" +
        "    | dd | ee " + "\n"
      );
      assertEq(rows.length, 2);

      const lines = rows.map(row => row.join(","));
      assertEq(lines[0], "aa,bb,cc");
      assertEq(lines[1], ",dd,ee");
    },

    function test_mrt_splitRow_1(){
      const line = "| a | b |";
      const cols = Mrtable.splitRow(line);
      assertEq(cols.length, 2);
    },

    function test_mrt_splitRow_2(){
      const line = "| a | b \\| c | \" \\| \" | d\\\"e |";
      const cols = Mrtable.splitRow(line);
      assertEq(cols.length, 4);

      assertEq(cols[0], "a");
      assertEq(cols[1], "b | c");
      assertEq(cols[2], '" | "');
      assertEq(cols[3], 'd\\"e');
    },

    function test_parse_mrtable(){
      const rows = parse_mrtable(
        "| c1xxxx | bb | cc |" + "\r\n" +
        "| -123 | 0 | e \\| e |" + "\n" +
        "| 12 |  |    |" + "\n" +
        "| null | \"null\" | \"\" |" + "\n",
        {}
      );
      assertEq(rows.length, 4);

      const lines = rows.map((cols)=>{
        return cols.map(col=>{
          if (col == null) {
            return "<null>";
          } else if (col === "") {
            return "<empty>";
          } else {
            return col;
          }
        }).join(",");
      });
      assertEq(lines[0], "c1xxxx,bb,cc");
      assertEq(lines[1], "-123,0,e | e");
      assertEq(lines[2], "12,<null>,<null>");
      assertEq(lines[3], "null,null,<empty>");
    },

    function test_parse_dbunitXml(){
      const rows = parse_dbunitXml(
          '<tbl aa="12ab" bb="1&quot;2" />\n'
        + '<tbl           bb="234" />\n'
      );
      assertEq(rows.length, 3);

      const lines = rows.map((cols)=>{
        return cols.map(col=>{
          if (col == null) {
            return "<null>";
          } else if (col === "") {
            return "<empty>";
          } else {
            return col;
          }
        }).join(",");
      });
      assertEq(lines[0], "aa,bb");
      assertEq(lines[1], "12ab,1\"2");
      assertEq(lines[2], "<null>,234");
    }
  ];

  let numErrors = 0;
  tests.forEach((_t)=>{
    try{
      _t();
    }catch(e){
      puts("----------------");
      puts(_t.name + " > " + e.message);
      puts(e);
      numErrors++;
    }
  });
  if(numErrors === 0){
    puts("OK");
  }
}
