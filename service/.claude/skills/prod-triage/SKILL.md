---
description: Triages a production or staging problem with this service — elevated latency, error-rate spikes, pod restarts, or an alert that just fired. Walks through Prometheus/Grafana metrics, Kubernetes pod state, and Istio mesh telemetry in a fixed order. Use this whenever the user says something is slow, erroring, timing out, restarting, or "on fire", or pastes an alert or a stack trace from a deployed environment.
argument-hint: <what's wrong, and which environment>
---

# Production triage

The failure mode of ad-hoc triage is confirmation bias: someone has a hunch,
queries the thing that would confirm it, and finds something that correlates.
So the order below is fixed. Work through it even when you think you already know
the answer — establishing that the other layers are healthy is what makes the
eventual conclusion trustworthy.

Ask which environment and roughly when it started before running anything. A
time window turns every query below from a guess into a comparison.

## 1. Is it the app, or is it the platform?

Start with pod state, because an app-level investigation is wasted if pods are
being killed underneath it.

Check restart counts and last termination reason. `OOMKilled` and `Error` mean
very different things: OOMKilled points at heap or container limits, `Error`
points at the app exiting on its own. Also check whether the restart count is
climbing right now or is a leftover from a deploy hours ago — a static non-zero
count is not an active incident.

Look at whether pods are passing readiness. A service that looks slow from
outside is often a service running on two of six pods because four are failing
readiness and getting no traffic.

## 2. Scope it: whose problem is it?

Use the mesh telemetry to separate "we are broken" from "something we call is
broken". Istio gives you both sides, which is the point.

Compare inbound and outbound error rates and latency. If inbound p99 is up but
every outbound dependency looks flat, the problem is in this service. If one
outbound destination's latency is up and inbound is up by roughly the same
amount, the problem is downstream and you're seeing it propagate.

Check whether it's all pods or one. Per-pod breakdown of the same metric answers
this immediately, and "one bad pod" has an entirely different fix from "the whole
deployment".

## 3. Golden signals, in this order

**Saturation before latency.** Latency is usually the symptom; saturation is
usually the cause. Check the connection pool first — a Hikari pool at its maximum
with a growing pending-connection count explains almost every "the service got
slow and the database looks fine" incident. The database is fine; nobody can get
to it.

Then thread pools, then heap and GC pause time, then CPU throttling. CPU
throttling is worth calling out specifically: a container hitting its CFS quota
shows healthy average CPU while every request pays a scheduling delay, so it
looks like mysterious latency rather than a resource problem.

**Error rate**, split by status class. 4xx climbing means callers changed or a
validation path is now failing; 5xx means us. Don't aggregate them — the combined
line hides which one moved.

**Latency**, and always as percentiles. A p50 that hasn't moved while p99 tripled
is a tail problem: lock contention, GC, a slow path taken by a subset of
requests. An average would show neither.

## 4. What changed?

Almost everything correlates with a change. Check, in order of likelihood:

- A deploy or config change to this service in the window.
- A deploy to a dependency.
- Traffic volume — is this a load problem rather than a regression?
- A data-shape change: one tenant, one large payload, one query whose plan
  flipped after a table grew past a threshold.

If nothing changed on our side and volume is flat, look harder at dependencies
before concluding it's spontaneous.

## 5. Write it down

Report findings as: the symptom, the metric that localizes it, what you ruled
out, and the confidence level. Distinguish clearly between "this is the cause"
and "this correlates". Naming an uncertain conclusion as certain is how an
incident gets closed and then reopened.

If mitigation is needed before diagnosis is complete, say so and separate the
two — rolling back to stop the bleeding is not the same as knowing why.