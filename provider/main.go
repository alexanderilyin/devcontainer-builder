package main

import (
	"context"
	"log"

	"github.com/hashicorp/terraform-plugin-framework/providerserver"

	"github.com/alexanderilyin/devcontainer-builder/provider/internal/provider"
)

func main() {
	err := providerserver.Serve(context.Background(), provider.New, providerserver.ServeOpts{
		// Never actually resolved against the real registry while using
		// dev_overrides (see provider/README.md); kept correct in case of
		// eventual publication.
		Address: "registry.terraform.io/alexanderilyin/devcontainerbuilder",
	})
	if err != nil {
		log.Fatal(err)
	}
}
