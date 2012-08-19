<%@ page language="java" contentType="text/html; charset=UTF-8"
    pageEncoding="UTF-8"%>
<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">

<script src="js/advchart/dojo.js.uncompressed.js" ></script>
<script src="js/advchart/myadvchart.js" ></script>

<title>Chart demo</title>
</head>
<body>
	<h1>Excessively magnifisent chart demo</h1>

	<a href="/camelwss/index.jsp">Back to index</a>
	<br>
    <img id="h2" src="img/blackh2.png" alt="hearthbeat" height="48" width="48" />
    <br>
	
	<div id="chartNode" style="width:800px;height:400px;"></div>
	<br>
	
	<input id="startButton" type="button" value="Start!">
	<input id="stopButton" type="button" value="Stop!">
        
    <!-- For outputting stuff -->
    <div id="my_div"></div>
</body>
</html>