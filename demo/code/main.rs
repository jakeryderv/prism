use std::collections::HashMap;

#[derive(Debug, Clone)]
struct Event {
    kind: &'static str,
    path: String,
}

fn count_by_kind(events: &[Event]) -> HashMap<&'static str, usize> {
    let mut out = HashMap::new();
    for e in events {
        *out.entry(e.kind).or_insert(0) += 1;
    }
    out
}

fn main() {
    let events = vec![
        Event { kind: "created", path: "a.md".into() },
        Event { kind: "modified", path: "a.md".into() },
    ];
    println!("{:?}", count_by_kind(&events));
}
