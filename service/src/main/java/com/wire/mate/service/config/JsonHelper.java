package com.wire.mate.service.config;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class JsonHelper {

    private static final Logger log = LoggerFactory.getLogger(JsonHelper.class);

    private final ObjectMapper objectMapper;

    public JsonHelper(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public <T> String toJson(T object) {
        try {
            return objectMapper.writeValueAsString(object);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Error serializing object to JSON", e);
        }
    }

    public <T> T fromJson(String json, Class<T> clazz) {
        try {
            return objectMapper.readValue(json, clazz);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Error deserializing JSON to " + clazz.getSimpleName(), e);
        }
    }

    public <T> List<T> fromJsonToList(String json, Class<T> elementClass) {
        try {
            JavaType type = objectMapper.getTypeFactory()
                    .constructCollectionType(List.class, elementClass);
            return objectMapper.readValue(json, type);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Error deserializing JSON to List<" + elementClass.getSimpleName() + ">", e);
        }
    }

    public <T> T deserialize(String message, String queue, Class<T> cls) {
        try {
            return objectMapper.readValue(message, cls);
        } catch (JsonProcessingException ex) {
            log.error("Failed to deserialize the message from queue: {} with exception message: {}", queue, ex.getMessage());
        }
        return null;
    }
}
