package com.wire.mate.service.exception;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.ValidationException;
import org.apache.coyote.BadRequestException;
import org.hibernate.InstantiationException;
import org.hibernate.LazyInitializationException;
import org.hibernate.NonUniqueResultException;
import org.hibernate.PropertyValueException;
import org.hibernate.query.sqm.PathElementException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.context.request.WebRequest;

import java.sql.SQLException;
import java.util.*;
import java.util.concurrent.TimeoutException;
import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(HttpClientErrorException.TooManyRequests.class)
    @ResponseStatus(HttpStatus.TOO_MANY_REQUESTS)
    public final ProblemDetail tooManyRequests(Exception ex, WebRequest req) {
        logger.info("Handle Too Many Requests - Exception: {} , WebRequest: {}", ex, req);
        return ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS, ex.getMessage());
    }

    @ExceptionHandler({BadRequestException.class, HttpMessageNotReadableException.class,
            PropertyValueException.class, ValidationException.class, BadRequestExc.class})
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public final ProblemDetail handleExceptions(Exception ex, WebRequest req) {
        logger.info("Handle Bad Request - Exception: {} , WebRequest: {}", ex, req);
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    @ExceptionHandler({NotFoundExc.class})
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public final ProblemDetail notFound(Exception ex, WebRequest req) {
        logger.info("Handle Not Found - Exception: {} , WebRequest: {}", ex, req);
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    @ExceptionHandler({NullPointerException.class,
            LazyInitializationException.class, TimeoutException.class, PathElementException.class,
            NoSuchElementException.class, NonUniqueResultException.class, InstantiationException.class,
            RuntimeException.class, InternalServerErrorExc.class})
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public final ProblemDetail handleInternalServerError(Exception ex, WebRequest req) {
        logger.info("Handle INTERNAL SERVER ERROR - Exception: {} , WebRequest: {}", ex, req);
        return ProblemDetail.forStatusAndDetail(
                HttpStatus.INTERNAL_SERVER_ERROR, "Something Went Wrong. Please Try Again Later"
        );
    }

    @ExceptionHandler({MethodArgumentNotValidException.class})
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    protected ProblemDetail handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex) {
        logger.info("handleMethodArgumentNotValid - MethodArgumentNotValidException: {}",
                ex.getMessage());

        List<String> errors = new ArrayList<>();
        ex.getBindingResult().getAllErrors().forEach(error -> {
            String fieldName = ((FieldError) error).getField();
            String message = error.getDefaultMessage();
            errors.add("Field Name: " + fieldName + " Message: " + message);
        });

        logger.info("MethodArgumentNotValidException: {}", errors);
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, errors.toString());
    }

    @ExceptionHandler({
            ObjectOptimisticLockingFailureException.class,
            OptimisticLockingFailureException.class
    })
    @ResponseBody
    public ProblemDetail handleConflict(Exception ex, WebRequest req) {
        logger.info("handleConflict - Exception: {} , WebRequest: {}", ex, req);
        return ProblemDetail.forStatusAndDetail(
                HttpStatus.CONFLICT,
                "Row was updated or deleted by another user. Please refresh the page and try again"
        );
    }

    @ExceptionHandler(ConstraintViolationException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    @ResponseBody
    public ProblemDetail handleConstraintViolationException(
            final ConstraintViolationException constraintViolationException) {
        Set<ConstraintViolation<?>> constraintViolations = constraintViolationException.getConstraintViolations();

        String message = constraintViolations.stream()
                .map(constraintViolation -> String.format(
                                "%s value '%s' %s",
                                constraintViolation.getPropertyPath(),
                                constraintViolation.getInvalidValue(), constraintViolation.getMessage()
                        )
                )
                .collect(Collectors.joining(", "));

        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, message);
    }

    @ExceptionHandler({SQLException.class, DataIntegrityViolationException.class})
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    @ResponseBody
    public ProblemDetail handelSqlExceptions(final SQLException sqlException) {
        logger.error("Something went wrong in database with cause: {}", sqlException.getMessage());
        return ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST, "Something went wrong in database"
        );
    }

    @ExceptionHandler({HttpRequestMethodNotSupportedException.class})
    @ResponseStatus(HttpStatus.METHOD_NOT_ALLOWED)
    public final ProblemDetail methodNotAllowed(Exception ex, WebRequest req) {
        logger.info("Handle METHOD NOT ALLOWED - Exception: {} , WebRequest: {}", ex, req);
        return ProblemDetail.forStatusAndDetail(HttpStatus.METHOD_NOT_ALLOWED, ex.getMessage());
    }

}
