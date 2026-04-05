package com.wire.mate.service.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure-function tests for {@link Util}. No Spring, no mocks.
 */
class UtilTest {

    @Nested
    @DisplayName("buildMetadata")
    class BuildMetadata {

        @Test
        @DisplayName("returns map with generatedBy=wiremate and projectId from arg")
        void containsExpectedEntries() {
            var projectId = UUID.randomUUID();

            Map<String, Object> result = Util.buildMetadata(projectId);

            assertThat(result)
                    .containsEntry("generatedBy", "wiremate")
                    .containsEntry("projectId", projectId)
                    .hasSize(2);
        }

        @Test
        @DisplayName("returns a fresh, mutable map each call (no shared state)")
        void freshMapPerCall() {
            var first = Util.buildMetadata(UUID.randomUUID());
            var second = Util.buildMetadata(UUID.randomUUID());

            first.put("extra", "x");

            assertThat(second).doesNotContainKey("extra");
        }
    }

    @Nested
    @DisplayName("firstPresentUrlKey")
    class FirstPresentUrlKey {

        @Test
        @DisplayName("returns null when the request definition is null")
        void nullDefinition() {
            assertThat(Util.firstPresentUrlKey(null)).isNull();
        }

        @Test
        @DisplayName("returns null when no URL match key is present")
        void noUrlKey() {
            assertThat(Util.firstPresentUrlKey(Map.of("method", "GET"))).isNull();
        }

        @ParameterizedTest
        @ValueSource(strings = {"url", "urlPath", "urlPattern", "urlPathPattern"})
        @DisplayName("detects each of the four mutually exclusive URL match keys")
        void detectsEachKey(String key) {
            assertThat(Util.firstPresentUrlKey(Map.of(key, "/x"))).isEqualTo(key);
        }

        @Test
        @DisplayName("honours URL_MATCH_KEYS priority order when several are present")
        void priorityOrder() {
            // `url` outranks `urlPath` per URL_MATCH_KEYS ordering.
            assertThat(Util.firstPresentUrlKey(Map.of("urlPath", "/p", "url", "/u")))
                    .isEqualTo("url");
        }
    }

    @Nested
    @DisplayName("replaceFirstPath")
    class ReplaceFirstPath {

        @ParameterizedTest
        @NullAndEmptySource
        @DisplayName("returns input unchanged when null or empty")
        void nullOrEmpty(String input) {
            assertThat(Util.replaceFirstPath(input, "anything")).isEqualTo(input);
        }

        @ParameterizedTest
        @CsvSource({
                "/foo/bar/baz, qux, /qux/bar/baz",
                "/foo,         qux, /qux",
                "/old/x,       new, /new/x"
        })
        @DisplayName("replaces only the first path segment")
        void replacesFirstSegment(String input, String newPath, String expected) {
            assertThat(Util.replaceFirstPath(input, newPath)).isEqualTo(expected);
        }

        @Test
        @DisplayName("PINNED: input without a leading slash has its SECOND segment replaced, not the first")
        // For "foo/bar": parts=["foo","bar"], parts[1]="new" → "foo/new". The function name
        // implies first-segment semantics but split-on-"/" places the first segment at index 1
        // only when there is a leading slash. Without a leading slash, the first segment is
        // at index 0 and parts[1] is the second segment.
        void noLeadingSlashReplacesSecondSegment() {
            assertThat(Util.replaceFirstPath("foo/bar", "new")).isEqualTo("foo/new");
        }

        @Test
        @DisplayName("PINNED: '/' input yields empty string (split strips trailing empties)")
        // String.split("/", "/") returns [] under default limit (trailing empties removed),
        // so the branch in Util is skipped and String.join produces "". Pinning this is
        // valuable because callers may rely on a non-empty result.
        void noSegmentToReplace() {
            assertThat(Util.replaceFirstPath("/", "new")).isEqualTo("");
        }
    }

    @Nested
    @DisplayName("toUrlFriendly")
    class ToUrlFriendly {

        @ParameterizedTest
        @NullAndEmptySource
        @ValueSource(strings = {" ", "   ", "\t"})
        @DisplayName("returns empty string for null/blank input")
        void emptyForBlank(String input) {
            assertThat(Util.toUrlFriendly(input)).isEmpty();
        }

        @ParameterizedTest
        @CsvSource({
                "'My Project',         'my-project'",
                "'  hello world  ',    'hello-world'",
                "'Hello---World',      'hello-world'",
                "'Hello!!!World',      'helloworld'",
                "'Áéí Óú',             'aei-ou'",
                "'A B  C',             'a-b-c'"
        })
        @DisplayName("normalizes input to a slug")
        void normalizes(String input, String expected) {
            assertThat(Util.toUrlFriendly(input)).isEqualTo(expected);
        }

        @Test
        @DisplayName("returns empty when input is only special characters")
        void onlySpecialChars() {
            assertThat(Util.toUrlFriendly("!!!@#$")).isEmpty();
        }
    }

    @Nested
    @DisplayName("curlReplaceFirstPath")
    class CurlReplaceFirstPath {

        @Test
        @DisplayName("returns input unchanged when curl is null")
        void nullCurl() {
            assertThat(Util.curlReplaceFirstPath(null, "x")).isNull();
        }

        @Test
        @DisplayName("returns input unchanged when newPath is null")
        void nullNewPath() {
            assertThat(Util.curlReplaceFirstPath("curl http://h/old/p", null))
                    .isEqualTo("curl http://h/old/p");
        }

        @Test
        @DisplayName("rewrites first path segment in a curl command")
        void rewritesFirstSegment() {
            var curl = "curl -X GET 'http://example.com/old-project/users/1'";

            var rewritten = Util.curlReplaceFirstPath(curl, "new-project");

            assertThat(rewritten).isEqualTo("curl -X GET 'http://example.com/new-project/users/1'");
        }

        @Test
        @DisplayName("trims leading/trailing slashes from newPath")
        void trimsSlashes() {
            var curl = "curl http://h/old/x";

            var rewritten = Util.curlReplaceFirstPath(curl, "/new/");

            assertThat(rewritten).isEqualTo("curl http://h/new/x");
        }

        @Test
        @DisplayName("returns input unchanged when no URL pattern is present")
        void noUrl() {
            assertThat(Util.curlReplaceFirstPath("not a curl command", "x"))
                    .isEqualTo("not a curl command");
        }

        @Test
        @DisplayName("PINNED: query string after first path segment is preserved")
        // The regex excludes '?' and '#' from the matched path segment, so anything after
        // the first segment (including ?query and #fragment) survives the rewrite.
        void queryStringPreserved() {
            var curl = "curl 'http://example.com/old-name/users?id=5&active=true'";

            var rewritten = Util.curlReplaceFirstPath(curl, "new-name");

            assertThat(rewritten)
                    .isEqualTo("curl 'http://example.com/new-name/users?id=5&active=true'");
        }

        @Test
        @DisplayName("PINNED: only the FIRST URL in the curl line is rewritten")
        // m.find() + m.replaceFirst — second URLs in the line are untouched.
        void onlyFirstUrlRewritten() {
            var curl = "curl http://a/old/x ; curl http://b/old/y";

            var rewritten = Util.curlReplaceFirstPath(curl, "new");

            assertThat(rewritten).isEqualTo("curl http://a/new/x ; curl http://b/old/y");
        }

        @Test
        @DisplayName("uses https scheme equally")
        void httpsScheme() {
            assertThat(Util.curlReplaceFirstPath("curl https://h/old/x", "new"))
                    .isEqualTo("curl https://h/new/x");
        }
    }

    @Nested
    @DisplayName("toUrlFriendly — additional edges")
    class ToUrlFriendlyEdges {

        @Test
        @DisplayName("retains digits")
        void retainsDigits() {
            assertThat(Util.toUrlFriendly("V2 api 3")).isEqualTo("v2-api-3");
        }

        @Test
        @DisplayName("collapses runs of mixed whitespace to a single hyphen")
        void collapsesWhitespace() {
            assertThat(Util.toUrlFriendly("a   \t  b")).isEqualTo("a-b");
        }

        @Test
        @DisplayName("strips emoji and other non-ASCII letter characters")
        void stripsEmoji() {
            assertThat(Util.toUrlFriendly("hello 🌍 world")).isEqualTo("hello-world");
        }
    }
}
