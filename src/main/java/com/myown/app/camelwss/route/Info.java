package com.myown.app.camelwss.route;

public class Info {

	private String header;
	private String msg;

	public String getHeader() {
		return header;
	}

	public void setHeader(String header) {
		this.header = header;
	}

	public String getMsg() {
		return msg;
	}

	public void setMsg(String msg) {
		this.msg = msg;
	}

	@Override
	public String toString() {
		return "[header: "+header+"|msg: "+msg+"]";
	}
	
	

}
