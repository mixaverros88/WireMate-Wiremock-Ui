package com.wire.mate.service.exception;

public class InternalServerErrorExc extends RuntimeException {

    public InternalServerErrorExc(String message) {
        super(message);
    }

    public InternalServerErrorExc(String message, Throwable cause) {
        super(message, cause);
    }

}
