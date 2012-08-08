require([ 
			"dojo/dom",
			"dojox/socket",
			"dojo/json",
//			"dojox/socket/Reconnect", // funker ikke med custom build prosessen
			"dojo/domReady!"	// should be defined last, don't assign a return var
			], 
			function(dom, dojoxSocket, json) {
			
			var socket = dojoxSocket("ws://localhost:9292/basic");
//			socket = socketReconnect(socket);  // funker ikke med custom build prosessen

			function send(data) {
				elem = dom.byId("my_div");
				var info = "[header:" + data.header + "|" + "msg:" + data.msg + "]";
				elem.innerHTML = elem.innerHTML +  "sending to server: "+info+" : redystate: " + socket.readyState + '<br>';
				
				return socket.send(json.stringify(data));
			}

			socket.on("message", function(event) {
				if( event.error)
				{
					myLog("message: oppstod feil.. " + event.error);
				}
				else
				{
					var resInfo = json.parse(event.data);
					myLog( "" + resInfo.msg );					
				}				
			});

			socket.on("open", function(event) {
				var info = { "header":"msg" , "msg":"hi server" };
				send(info);
			});
			
			socket.on( "error",  function(e) {
				myLog("errorl.. " + e);
				myLog("error.. " + event.error);
				myLog("error.. " + event.type);
			});
			
			socket.on("close", function(event, args){
				myLog('disconnected');
				socket.close();
			}, false, false);
			
			addClick = function() 
            { 
				var info = { "header":"msg" , "msg":"ping" };
                    dom.byId("myButton").onclick = function(evt) { 
                            send(info); 
                    };
            };
            addClick();
            
            myLog = function( str )
            {
            	elem = dom.byId("my_div");
				elem.innerHTML = elem.innerHTML +  str + '<br>';
            };


		});
		
// 		require(["dojo/domReady!"], function(){
// 			  // will not run until DOM is finished loading
// 			  if(dayOfWeek == "Sunday"){
// 			    document.musicPrefs.other.value = "Afrobeat";
// 			  }
// 			});