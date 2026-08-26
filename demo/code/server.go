package main

import (
	"fmt"
	"net/http"
)

func handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "hello from %s", r.URL.Path)
}

func main() {
	http.HandleFunc("/", handler)
	fmt.Println("listening on :8080")
	_ = http.ListenAndServe(":8080", nil)
}
