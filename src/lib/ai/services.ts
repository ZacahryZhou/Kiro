// The single switch point for service functions. AI code imports services only from here.
// Development: fake in-memory services. At H3/H6 this becomes exports from "@/services/read" / "@/services/write".
export * from "./dev/fake-services";
