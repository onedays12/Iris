#pragma once

#include "beacon_common.h"
#include "beacon_profile.h"

INT TransportHttpExchange(const Profile* profile, const ByteBuf* metadata, const ByteBuf* payload, ByteBuf* response);
