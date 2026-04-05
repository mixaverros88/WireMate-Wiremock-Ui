package com.wire.mate.service.exception;

public class NotFoundExc extends RuntimeException {

    public NotFoundExc(String message) {
        super(message + " is not found");
    }
}
