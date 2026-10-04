import { Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RequestDecision } from "@/components/request-decision";
import { EmptyState, ErrorAlert, Initial, PageHeader, SectionHeading } from "@/components/page";
import { requireRole } from "@/lib/auth/actor";
import { formatLocalDate, formatLocalTime } from "@/lib/time";
import { listStudentRequests, type StudentRequestView } from "@/services/read";

const kindLabel = { LEAVE: "Leave request", RESCHEDULE: "Different time requested" } as const;

function RequestCard({ request, timeZone, actions }: { request: StudentRequestView; timeZone: string; actions?: boolean }) {
  const when = new Date(request.sessionStartAt);
  return (
    <li className="kora-card space-y-3 p-5" data-testid="request-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Initial name={request.studentName} className="size-9 text-sm" />
          <div>
            <p className="font-medium">{request.studentName}</p>
            <p className="text-sm text-muted-foreground">{request.courseName}</p>
          </div>
        </div>
        <Badge variant={request.status === "PENDING" ? "outline" : request.status === "APPROVED" ? "secondary" : "destructive"}>
          {request.status === "PENDING" ? "Pending" : request.status === "APPROVED" ? "Approved" : "Declined"}
        </Badge>
      </div>
      <dl className="grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-muted-foreground">Request</dt>
        <dd>{kindLabel[request.kind]}</dd>
        <dt className="text-muted-foreground">Session</dt>
        <dd>{formatLocalDate(when, timeZone)}, {formatLocalTime(when, timeZone)}</dd>
        {request.preferredStartAt && (
          <>
            <dt className="text-muted-foreground">Preferred time</dt>
            <dd>{formatLocalDate(new Date(request.preferredStartAt), timeZone)}, {formatLocalTime(new Date(request.preferredStartAt), timeZone)}</dd>
          </>
        )}
        {request.note && (
          <>
            <dt className="text-muted-foreground">Note</dt>
            <dd className="whitespace-pre-wrap">{request.note}</dd>
          </>
        )}
      </dl>
      {actions && (
        <>
          <RequestDecision requestId={request.id} />
          <p className="text-xs text-muted-foreground">Answering a request does not change the schedule or attendance. Move the session yourself if you agree.</p>
        </>
      )}
    </li>
  );
}

export default async function Page() {
  const actor = await requireRole("TEACHER");
  const timeZone = process.env.APP_TZ || "America/Vancouver";
  const result = await listStudentRequests(actor, {});
  const pending = result.ok ? result.data.requests.filter((request) => request.status === "PENDING") : [];
  const answered = result.ok ? result.data.requests.filter((request) => request.status !== "PENDING") : [];

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Teacher Workspace"
        title="Student requests"
        description="Leave and different-time requests from your students. Answering one is a note to the student; it never edits the schedule or attendance."
      />
      {!result.ok ? (
        <ErrorAlert message={result.error.message} />
      ) : (
        <>
          <div className="space-y-4">
            <SectionHeading title="Waiting for you" description={`${pending.length} pending`} />
            {pending.length === 0 ? (
              <EmptyState icon={Inbox} title="No pending requests" description="When a student asks for leave or a different time, it will show up here." />
            ) : (
              <ul className="space-y-4">{pending.map((request) => <RequestCard key={request.id} request={request} timeZone={timeZone} actions />)}</ul>
            )}
          </div>
          {answered.length > 0 && (
            <div className="space-y-4">
              <SectionHeading title="Answered" />
              <ul className="space-y-4">{answered.map((request) => <RequestCard key={request.id} request={request} timeZone={timeZone} />)}</ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
