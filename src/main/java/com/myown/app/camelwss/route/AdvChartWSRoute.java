package com.myown.app.camelwss.route;

import java.util.Random;

import org.apache.camel.Exchange;
import org.apache.camel.Processor;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.model.dataformat.JsonLibrary;
import org.eclipse.jetty.io.EofException;
import org.joda.time.DateTime;
import org.joda.time.Interval;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class AdvChartWSRoute extends RouteBuilder {
	
static Logger logger = LoggerFactory.getLogger(AdvChartWSRoute.class);
	
	private final String CONNECTION_URI = "//localhost:9292/advchart";

	@Override
	public void configure() throws Exception {
		
		onException(EofException.class)
			.log("oops EofException");
		
		from("websocket:"+CONNECTION_URI+"?enableJmx=false")
		.routeId("chartRoute")
//        .log(LoggingLevel.DEBUG,">> msg recieved : ${body}")
        .unmarshal().json(JsonLibrary.Jackson, WsMessage.class)
        .process(new Processor() {
			
			@Override
			public void process(Exchange exchange) throws Exception {
				WsMessage info = exchange.getIn().getBody(WsMessage.class);
				
				
				if( "heartbeat".equals(info.getHeader()))
				{
					if( "client".equals(info.getSender()))
					{
						logger.info("Got heartbeat from client");
						DateTime start = new DateTime(Long.valueOf(info.getSenderTimestamp()));
						DateTime atclient = new DateTime(Long.valueOf(info.getContent()));
						DateTime now = new DateTime();
						
						logger.info("roundtrip is: start: " + start + " at client: " + atclient + " now: " + now);
						Interval diff = new Interval(start, now);
						logger.info("roundtrip time: " + diff.toDurationMillis());
					}
					
				}
				
				if( "cmd".equals(info.getHeader()))
				{
					if( "start".equals(info.getContent()))
					{
						exchange.getContext().startRoute("heartbeatRoute");
						exchange.getContext().startRoute("timerRoute");
					}
					if( "stop".equals(info.getContent()))
					{
						exchange.getContext().stopRoute("heartbeatRoute");
						exchange.getContext().stopRoute("timerRoute");
					}
				}
			}
		});
		
		
		
		from("timer://myTimer?fixedRate=true&period=3000")	// 10sec
		.routeId("heartbeatRoute")
		.noAutoStartup()
		.process(new Processor() {
			
			@Override
			public void process(Exchange exchange) throws Exception {
							
				WsMessage message = new WsMessage();
				message.setHeader("heartbeat");
				message.setSender("server");
				
				message.setSenderTimestamp(String.valueOf(new DateTime().getMillis()));
				
				exchange.getIn().setBody(message, WsMessage.class);				
			}
		})
		.marshal().json(JsonLibrary.Jackson, WsMessage.class)
		.to("direct:chartAdvUt");
		
		
		from("timer://myTimer?fixedRate=true&period=100")
		.routeId("timerRoute")
		.noAutoStartup()
		.process(new Processor() {
			
			Random randomGenerator = new Random();
			
			@Override
			public void process(Exchange exchange) throws Exception {
							
				WsMessage response = new WsMessage();
				response.setHeader("msg");
				String message = String.valueOf(randomGenerator.nextInt(20) + 1);
				response.setSender("server");
				response.setContent( message );
				exchange.getIn().setBody(response, WsMessage.class);
				
			}
		})
		.marshal().json(JsonLibrary.Jackson, WsMessage.class)
		.to("direct:chartAdvUt");
		
		
		
		from("direct:chartAdvUt")
//		.log(LoggingLevel.DEBUG,">> msg response : ${body}")
        .to("websocket:"+CONNECTION_URI+"?sendToAll=true&enableJmx=false");

	}

}
