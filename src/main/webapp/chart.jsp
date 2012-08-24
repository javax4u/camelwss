<%@ page language="java" contentType="text/html; charset=UTF-8"
    pageEncoding="UTF-8"%>
<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">

<script src="js/chart/dojo.js.uncompressed.js" ></script>
<script src="js/chart/mychart.js" ></script>

<title>Chart demo</title>
</head>
<body>
	<h1>Excessively Magnifisent Chart Demo</h1>

	<a href="/camelwss/index.jsp">Back to index</a>
	<br>
	
	<div id="chartNode" style="width:800px;height:400px;"></div>
	<br>
	
	<input id="startButton" type="button" value="Start!">
	<input id="stopButton" type="button" value="Stop!">
    
    <!-- For outputting stuff -->
    <div id="my_div"></div>
</body>
</html>