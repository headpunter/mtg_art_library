#!/bin/sh
set -e

# Generate the shared nav fragment from the template.
# ENABLED_MODULES is a comma-separated list, e.g. "art_library,deck_builder"
# Modules NOT in the list get aria-disabled="true" and class="disabled".

ENABLED="${ENABLED_MODULES:-art_library,deck_primer,collection_rec,deck_builder}"

disabled_attr() {
    module="$1"
    case ",$ENABLED," in
        *",$module,"*) echo "" ;;
        *)             echo 'aria-disabled="true" class="module-nav__tab module-nav__tab--disabled"' ;;
    esac
}

ART_LIBRARY_DISABLED=$(disabled_attr art_library)
DECK_PRIMER_DISABLED=$(disabled_attr deck_primer)
COLLECTION_REC_DISABLED=$(disabled_attr collection_rec)
DECK_BUILDER_DISABLED=$(disabled_attr deck_builder)

export ART_LIBRARY_DISABLED DECK_PRIMER_DISABLED COLLECTION_REC_DISABLED DECK_BUILDER_DISABLED

envsubst '${ART_LIBRARY_DISABLED} ${DECK_PRIMER_DISABLED} ${COLLECTION_REC_DISABLED} ${DECK_BUILDER_DISABLED}' \
    < /etc/nginx/nav.template.html \
    > /usr/share/nginx/html/nav.html

exec nginx -g "daemon off;"
