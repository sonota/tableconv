function puts(){
  console.log.apply(console, arguments);
}

function convert(text){
  var src = $(".input").val();
  var lines = src.split("\n");
  var rows = _(lines).map(function(line){
    return line.split(",");
  });

  $(".output_json").val(JSON.stringify(rows));
}

$(function(){

  // Events

  $(".input").on("input", convert);
  
  // Init

  convert();

});
