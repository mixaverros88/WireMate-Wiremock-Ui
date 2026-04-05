package com.wire.mate.service.entity;

import com.wire.mate.service.entity.mock.Mock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pin entity-level contracts that the service-layer tests don't exercise directly:
 * equals/hashCode for {@link Mock} (used as Set elements via {@link Project#getMockList()}),
 * and the {@code toDto}/{@code toWiremockRequest} mapping methods.
 */
class EntityContractTest {

    @Nested
    @DisplayName("Mock.equals / hashCode")
    class MockIdentity {

        @Test
        @DisplayName("two Mocks with the same id are equal")
        void sameIdEqual() {
            var id = UUID.randomUUID();
            var a = new Mock();
            a.setId(id);
            var b = new Mock();
            b.setId(id);

            assertThat(a).isEqualTo(b);
        }

        @Test
        @DisplayName("two Mocks with different ids are not equal")
        void differentIdsUnequal() {
            var a = new Mock();
            a.setId(UUID.randomUUID());
            var b = new Mock();
            b.setId(UUID.randomUUID());

            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("same reference is equal even when id is null")
        void sameRefEqualEvenWithNullId() {
            var a = new Mock();

            assertThat(a).isEqualTo(a);
        }

        @Test
        @DisplayName("two distinct Mocks with null ids are NOT equal (id-based equality)")
        void nullIdsNotEqual() {
            var a = new Mock();
            var b = new Mock();

            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("equals returns false when this.id is null but other.id is non-null")
        void thisNullOtherNonNull() {
            var a = new Mock();
            var b = new Mock();
            b.setId(UUID.randomUUID());

            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("equals returns false when this.id is non-null but other.id is null")
        void thisNonNullOtherNull() {
            var a = new Mock();
            a.setId(UUID.randomUUID());
            var b = new Mock();

            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("equals returns false for null argument")
        void equalsNull() {
            var a = new Mock();
            a.setId(UUID.randomUUID());

            assertThat(a.equals(null)).isFalse();
        }

        @Test
        @DisplayName("equals returns false for other types")
        void notEqualToOtherType() {
            var a = new Mock();
            a.setId(UUID.randomUUID());

            assertThat(a).isNotEqualTo("x");
        }

        @Test
        @DisplayName("hashCode is constant across all Mock instances (class.hashCode)")
        void hashCodeIsConstant() {
            var a = new Mock();
            a.setId(UUID.randomUUID());
            var b = new Mock();
            b.setId(UUID.randomUUID());

            assertThat(a.hashCode()).isEqualTo(b.hashCode());
            assertThat(a.hashCode()).isEqualTo(Mock.class.hashCode());
        }

        @Test
        @DisplayName("PINNED: HashSet relies on equals — two Mocks with different ids are stored as distinct elements")
        // Despite the constant hashCode bucketing them together, equals decides set membership.
        // This invariant is important for Project.mockList which is a HashSet.
        void hashSetUsesEquals() {
            var a = new Mock();
            a.setId(UUID.randomUUID());
            var b = new Mock();
            b.setId(UUID.randomUUID());
            var set = new HashSet<Mock>();

            set.add(a);
            set.add(b);

            assertThat(set).hasSize(2);
        }
    }

    @Nested
    @DisplayName("Project.toDto")
    class ProjectDto {

        @Test
        @DisplayName("maps id and name into the response")
        void mapsFields() {
            var p = new Project("alpha");
            var id = UUID.randomUUID();
            p.setId(id);

            var dto = p.toDto();

            assertThat(dto.id()).isEqualTo(id);
            assertThat(dto.name()).isEqualTo("alpha");
        }
    }

    @Nested
    @DisplayName("Mock.toDto / toWiremockRequest")
    class MockDto {

        private Mock fullyPopulatedMock() {
            var p = new Project("p");
            p.setId(UUID.randomUUID());
            var m = new Mock(
                    "m", "desc", p,
                    new HashMap<>(Map.of("urlPath", "/x")),
                    new HashMap<>(Map.of("status", 200)),
                    true, 7,
                    new HashMap<>(Map.of("projectId", p.getId().toString())),
                    List.of(new HashMap<>(Map.of("name", "webhook"))),
                    "curl http://h/p/x");
            m.setId(UUID.randomUUID());
            return m;
        }

        @Test
        @DisplayName("toDto carries all fields including project id and name")
        void toDtoMapsAll() {
            var m = fullyPopulatedMock();

            var dto = m.toDto();

            assertThat(dto.id()).isEqualTo(m.getId());
            assertThat(dto.name()).isEqualTo("m");
            assertThat(dto.description()).isEqualTo("desc");
            assertThat(dto.projectId()).isEqualTo(m.getProject().getId());
            assertThat(dto.projectName()).isEqualTo("p");
            assertThat(dto.request()).containsEntry("urlPath", "/x");
            assertThat(dto.response()).containsEntry("status", 200);
            assertThat(dto.persistent()).isTrue();
            assertThat(dto.priority()).isEqualTo(7);
            assertThat(dto.metadata()).containsKey("projectId");
            assertThat(dto.serveEventListeners()).hasSize(1);
            assertThat(dto.curl()).isEqualTo("curl http://h/p/x");
        }

        @Test
        @DisplayName("toWiremockRequest drops description/curl/projectName (not part of WireMock format)")
        void toWireMockReqOmitsLocalFields() {
            var m = fullyPopulatedMock();

            var req = m.toWiremockRequest();

            assertThat(req.id()).isEqualTo(m.getId());
            assertThat(req.name()).isEqualTo("m");
            assertThat(req.request()).containsEntry("urlPath", "/x");
            assertThat(req.response()).containsEntry("status", 200);
            assertThat(req.persistent()).isTrue();
            assertThat(req.priority()).isEqualTo(7);
            assertThat(req.metadata()).containsKey("projectId");
            assertThat(req.serveEventListeners()).hasSize(1);
        }
    }

    @Nested
    @DisplayName("Mock(Mock other, Project) deep-copy constructor")
    class DeepCopyCtor {

        @Test
        @DisplayName("copies JSONB maps to fresh HashMap instances (mutating source does NOT affect copy)")
        void deepCopyIsolatesMaps() {
            var p1 = new Project("a"); p1.setId(UUID.randomUUID());
            var p2 = new Project("b"); p2.setId(UUID.randomUUID());
            var srcReq = new HashMap<String, Object>(Map.of("k", "v"));
            var srcMeta = new HashMap<String, Object>(Map.of("projectId", p1.getId().toString()));
            var srcListeners = new java.util.ArrayList<Map<String, Object>>();
            srcListeners.add(new HashMap<>(Map.of("name", "x")));
            var src = new Mock("s", "d", p1, srcReq, new HashMap<>(), false, 1, srcMeta, srcListeners, "c");

            var copy = new Mock(src, p2);

            // Mutate source after copy
            srcReq.put("k", "MUTATED");
            srcMeta.put("projectId", "MUTATED");
            srcListeners.get(0).put("name", "MUTATED");

            assertThat(copy.getRequestDefinition()).containsEntry("k", "v");
            assertThat(copy.getMetadata()).containsEntry("projectId", p1.getId().toString());
            assertThat(copy.getServeEventListeners().get(0)).containsEntry("name", "x");
            assertThat(copy.getProject()).isEqualTo(p2);
        }

        @Test
        @DisplayName("nulls in source remain null in copy (no NPE)")
        void nullSafeCopy() {
            var p = new Project("p"); p.setId(UUID.randomUUID());
            var src = new Mock();
            src.setName("s");
            src.setProject(p);
            // All JSONB fields null

            var copy = new Mock(src, p);

            assertThat(copy.getRequestDefinition()).isNull();
            assertThat(copy.getResponseDefinition()).isNull();
            assertThat(copy.getMetadata()).isNull();
            assertThat(copy.getServeEventListeners()).isNull();
        }
    }

    @Nested
    @DisplayName("Notification")
    class NotificationContract {

        @Test
        @DisplayName("toDto maps id, name, and createdAt")
        void toDtoMaps() {
            var n = new Notification("drift!");
            n.setId(99L);

            var dto = n.toDto();

            assertThat(dto.id()).isEqualTo(99L);
            assertThat(dto.name()).isEqualTo("drift!");
            assertThat(dto.createdAt()).isEqualTo(n.getCreatedAt());
        }
    }
}
