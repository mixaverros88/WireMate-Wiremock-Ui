package com.wire.mate.service.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JsonHelperTest {

    private JsonHelper helper;

    @BeforeEach
    void setUp() {
        helper = new JsonHelper(new ObjectMapper());
    }

    /** Record used to exercise round-tripping. */
    record Sample(String name, int value) {}

    @Nested
    @DisplayName("toJson")
    class ToJson {

        @Test
        @DisplayName("serializes records into JSON")
        void happyPath() {
            assertThat(helper.toJson(new Sample("a", 1)))
                    .isEqualTo("{\"name\":\"a\",\"value\":1}");
        }

        @Test
        @DisplayName("serializes maps with nested values")
        void nested() {
            var json = helper.toJson(Map.of("k", List.of(1, 2, 3)));
            assertThat(json).contains("\"k\"").contains("1,2,3");
        }

        @Test
        @DisplayName("wraps JsonProcessingException as RuntimeException")
        void failure() {
            // A getter that throws is reliably wrapped by Jackson as a JsonMappingException
            // (subclass of JsonProcessingException), which JsonHelper re-wraps as RuntimeException.
            var bad = new ThrowingGetter();

            assertThatThrownBy(() -> helper.toJson(bad))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("Error serializing object to JSON");
        }

        /** Public static so Jackson can introspect it. */
        public static class ThrowingGetter {
            @SuppressWarnings("unused")
            public String getBoom() { throw new IllegalStateException("nope"); }
        }
    }

    @Nested
    @DisplayName("fromJson")
    class FromJson {

        @Test
        @DisplayName("deserializes JSON into a record")
        void happyPath() {
            var sample = helper.fromJson("{\"name\":\"a\",\"value\":1}", Sample.class);
            assertThat(sample).isEqualTo(new Sample("a", 1));
        }

        @Test
        @DisplayName("wraps invalid JSON as RuntimeException with target class name")
        void invalidJson() {
            assertThatThrownBy(() -> helper.fromJson("{not json", Sample.class))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("Sample");
        }
    }

    @Nested
    @DisplayName("fromJsonToList")
    class FromJsonToList {

        @Test
        @DisplayName("deserializes JSON array into a typed list")
        void happyPath() {
            var list = helper.fromJsonToList(
                    "[{\"name\":\"a\",\"value\":1},{\"name\":\"b\",\"value\":2}]",
                    Sample.class);
            assertThat(list)
                    .containsExactly(new Sample("a", 1), new Sample("b", 2));
        }

        @Test
        @DisplayName("returns empty list for an empty array")
        void emptyArray() {
            assertThat(helper.fromJsonToList("[]", Sample.class)).isEmpty();
        }

        @Test
        @DisplayName("wraps invalid JSON as RuntimeException naming the element class")
        void invalidJson() {
            assertThatThrownBy(() -> helper.fromJsonToList("not-json", Sample.class))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("Sample");
        }
    }

    @Nested
    @DisplayName("deserialize (queue-style helper)")
    class Deserialize {

        @Test
        @DisplayName("returns the parsed value on a valid payload")
        void happyPath() {
            assertThat(helper.deserialize("{\"name\":\"a\",\"value\":1}", "q1", Sample.class))
                    .isEqualTo(new Sample("a", 1));
        }

        @Test
        @DisplayName("PINNED: returns null (does NOT throw) on parse failure — different from fromJson")
        // This method intentionally diverges from fromJson — used by queue consumers that
        // log and skip bad messages rather than crashing the listener.
        void failureReturnsNull() {
            assertThat(helper.deserialize("not-json", "q1", Sample.class)).isNull();
        }
    }
}
