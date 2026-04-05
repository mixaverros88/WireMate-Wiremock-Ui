package com.wire.mate.service.util;

import java.text.Normalizer;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class Util {

    // WireMock matches requests with exactly one of these four mutually
    // exclusive keys, so any rewrite has to find whichever one is present
    // rather than hard-coding `urlPath` (a mock created with `url`,
    // `urlPattern`, or `urlPathPattern` would otherwise NPE).
    public static final List<String> URL_MATCH_KEYS = List.of("url", "urlPath", "urlPattern", "urlPathPattern");

    public static Map<String, Object> buildMetadata(UUID projectId) {
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("generatedBy", "wiremate");
        metadata.put("projectId", projectId);
        return metadata;
    }

    public static String firstPresentUrlKey(Map<String, Object> requestDefinition) {
        if (requestDefinition == null) {
            return null;
        }
        for (String key : URL_MATCH_KEYS) {
            if (requestDefinition.get(key) != null) {
                return key;
            }
        }
        return null;
    }

    public static String replaceFirstPath(String url, String newPath) {
        if (url == null || url.isEmpty()) {
            return url;
        }

        String[] parts = url.split("/");

        // parts[0] will be empty because URL starts with "/"
        if (parts.length > 1) {
            parts[1] = newPath;
        }

        return String.join("/", parts);
    }

    public static String toUrlFriendly(String input) {
        if (input == null || input.isBlank()) {
            return "";
        }
        String normalized = Normalizer.normalize(input, Normalizer.Form.NFD);
        String withoutAccents = Pattern.compile("\\p{InCombiningDiacriticalMarks}+")
                .matcher(normalized).replaceAll("");
        return withoutAccents
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9\\s-]", "")  // strip non-alphanumerics
                .trim()
                .replaceAll("\\s+", "-")           // spaces -> hyphens
                .replaceAll("-{2,}", "-");         // collapse multiple hyphens
    }

    private static final Pattern FIRST_PATH = Pattern.compile("(https?://[^/\\s'\"]+)/[^/\\s'\"?#]+");

    public static String curlReplaceFirstPath(String curl, String newPath) {
        if (curl == null || newPath == null) {
            return curl;
        }
        String cleanPath = newPath.replaceAll("^/+|/+$", ""); // trim slashes
        Matcher m = FIRST_PATH.matcher(curl);
        return m.find()
                ? m.replaceFirst("$1/" + Matcher.quoteReplacement(cleanPath))
                : curl;
    }
}
